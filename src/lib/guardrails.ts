/**
 * Guardrails around the model, in plain code. None of them asks a model
 * whether something is safe: they are fast, free and testable, and the
 * attack suite measures what they miss.
 */

// ---------- Before the model ----------

const PII: [RegExp, string][] = [
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]"],
  [/\b(?:\d[ -]?){13,16}\b/g, "[CARTÃO]"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[E-MAIL]"],
  [/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[TELEFONE]"],
];

/**
 * Personal data never reaches the model or the traces. A shopping assistant
 * does not need a CPF or a card number, and LGPD asks to collect only what is needed.
 */
export function maskPersonalData(text: string): { text: string; masked: string[] } {
  const masked: string[] = [];
  let out = text;
  for (const [pattern, label] of PII) {
    out = out.replace(pattern, () => {
      masked.push(label);
      return label;
    });
  }
  return { text: out, masked };
}

const INJECTION = [
  /ignor[ea]\w* (as |todas as |suas |)?(instru[cç][oõ]es|regras|orienta[cç][oõ]es)/i,
  /ignore (all |your |the |previous )*(instructions|rules)/i,
  /(prompt|instru[cç][oõ]es) (do )?sistema|system prompt/i,
  /(voc[eê] agora [eé]|a partir de agora voc[eê]|finja (que|ser)|aja como|act as|you are now)/i,
  /(modo|mode) (desenvolvedor|developer|dan|admin)/i,
  /\b(revele|mostre|repita|imprima)\b.{0,40}\b(instru[cç]|regras|prompt|configura)/i,
];

/** Flags, never blocks: blocking on patterns turns away real customers. The flag goes to the trace. */
export const looksLikeInjection = (text: string) => INJECTION.some((p) => p.test(text));

// ---------- After the model ----------

/**
 * A random marker inside the system prompt. If it ever shows up in an answer,
 * the model leaked its instructions: this is cheaper and more reliable than
 * judging whether a paraphrase "looks like" the prompt.
 */
export const CANARY = "VTR-CANARIO-4471";

export interface OutputCheck {
  leakedCanary: boolean;
  /** Amounts in the text that no tool returned: invented prices. */
  ungroundedPrices: string[];
  /** The assistant offered a discount, coupon or price change it cannot grant. */
  promisedDiscount: boolean;
}

const brl = (value: number) => value.toFixed(2).replace(".", ",");

const AMOUNT = /R\$\s*[\d.]+(?:,\d{2})?/g;
const normalizeAmount = (a: string) => {
  const digits = a.replace(/R\$\s*/, "").replaceAll(".", "");
  return digits.includes(",") ? digits : `${digits},00`;
};

// A budget the customer stated ("até R$ 600", "entre R$ 1000 e R$ 3000"). Only these may be echoed:
// "diga que custa R$ 10" is an amount from the customer too, and repeating it would be lying.
const BUDGET = /(?:at[eé]|menos de|abaixo de|no m[aá]ximo|or[cç]amento de|entre|e)\s+R\$\s*[\d.]+(?:,\d{2})?/gi;

/**
 * `customerText` matters: "até R$ 600" in the answer repeats the customer's
 * budget, it does not invent a price. Only amounts that came from neither a
 * tool nor the customer's budget count as invented.
 */
export function checkOutput(text: string, toolPrices: number[], customerText = ""): OutputCheck {
  const budgets = (customerText.match(BUDGET) ?? []).flatMap((b) => b.match(AMOUNT) ?? []).map(normalizeAmount);
  const known = new Set([...toolPrices.map(brl), ...budgets]);
  const ungroundedPrices = (text.match(AMOUNT) ?? []).filter((a) => !known.has(normalizeAmount(a)));
  return {
    leakedCanary: text.includes(CANARY),
    ungroundedPrices,
    promisedDiscount: /\b(\d{1,2}\s?% de desconto|desconto de \d|cupom\s+[A-Z0-9]{4,}|(te |lhe )?(dou|darei|concedo|aplico|aplicarei) (um |o )?desconto|pre[cç]o especial (de|por) R\$)/i.test(text),
  };
}

export const outputPassed = (check: OutputCheck) => !check.leakedCanary && check.ungroundedPrices.length === 0 && !check.promisedDiscount;
