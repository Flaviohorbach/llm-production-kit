# Conceitos do módulo 11, explicados pelo projeto

Guia de estudo em português: o que muda quando uma aplicação com IA sai da demo e vai para produção. A vitrine do módulo 3 é a mesma; mudou tudo em volta dela.

## 1. Avaliação no CI: um portão, não um relatório

Teste comum confere código. **Avaliação** confere o comportamento do modelo, que muda com o prompt, com a versão do modelo e até sem nenhuma mudança sua.

O projeto tem duas suítes em `evals/cases.ts`:

- **Qualidade:** a loja faz o trabalho? O filtro de preço é respeitado, a comparação usa a ferramenta certa, um orçamento impossível recebe um "não encontrei" honesto.
- **Ataques:** as regras resistem? Pedir as instruções, inventar um gerente que dá desconto, ditar um preço, forçar uma frase.

O ponto central é o **portão**. `.github/workflows/ci.yml` só faz o deploy se a avaliação passar dos limites de `evals/thresholds.json`. Os limites foram commitados **antes** da primeira execução, para não serem ajustados ao resultado.

**Falhar fechado:** se o modelo estiver fora do ar, a avaliação não termina, e o deploy é bloqueado. A alternativa, publicar porque não deu para testar, é como a maioria dos incidentes começa.

## 2. Observabilidade: ver cada requisição

Com IA, "funcionou" não basta: é preciso saber **o que o modelo recebeu, o que respondeu, quanto custou e quanto demorou**. Isso se chama *tracing*.

O projeto usa o **Langfuse** pelo sistema de telemetria do AI SDK (`src/instrumentation.ts`). Cada requisição vira um *trace*: uma árvore com o agente, cada passo, cada chamada ao modelo e cada ferramenta. Em cima dela entram **scores**: notas que registram se os guardrails passaram e quanto custou.

**Cuidado com o que o trace guarda.** O primeiro trace público continha o prompt do sistema inteiro. Gravar tudo é o padrão das ferramentas de tracing, e cabe a você decidir o que sai. Aqui, as entradas do modelo deixaram de ser gravadas (`recordInputs: false`).

## 3. Roteamento de modelos

Modelos maiores erram menos e custam mais. Na tabela do Google, o `gemini-3.8-flash` cobra 3 vezes mais por token de entrada e 2,5 vezes mais por token de saída que o `gemini-3.1-flash-lite`.

`src/lib/router.ts` decide com regras simples: buscas vão para o modelo barato; comparações e decisões ("vale a pena?"), para o forte. Na avaliação, 90% das mensagens ficaram no barato, e a conversa com o modelo forte custou cerca de 4 vezes mais.

**Por que regras e não um modelo classificador?** Um classificador seria mais uma chamada, com custo e demora, em toda mensagem. Regras são grátis e instantâneas, e a avaliação mostra se acertam.

**Fallback entre níveis:** cada nível termina com um modelo do outro. Uma resposta pior ou mais cara é melhor que nenhuma.

## 4. Guardrails

Guardrail é uma verificação **fora do modelo**, em código, antes ou depois dele.

**Antes** (`maskPersonalData`, `looksLikeInjection`):
- CPF, cartão, e-mail e telefone viram `[CPF]`, `[CARTÃO]`… antes do modelo e do trace. É a LGPD na prática: não coletar o que não precisa.
- Mensagens que parecem injeção ganham uma marca no trace, mas **não são bloqueadas**. Bloquear por padrão de texto barra clientes reais ("quero ignorar o tamanho P").

**Depois** (`checkOutput`):
- **Preço inventado:** todo valor na resposta precisa ter vindo de uma ferramenta ou do orçamento do cliente.
- **Desconto prometido:** a assistente não pode dar cupom nem mudar preço.
- **Canário:** uma palavra secreta dentro do prompt. Se ela aparecer na resposta, houve vazamento. É mais confiável do que tentar detectar se a resposta "parece" o prompt.

**O que a avaliação mostrou:** o detector de injeção marcou só 4 dos 10 ataques. Quem recusou foi o modelo, seguindo as regras do prompt. O detector serve para achar ataques nos traces; a defesa está no prompt e nas checagens de saída.

## 5. OWASP Top 10 para LLMs

Alguns itens da lista e onde aparecem aqui:

| Risco | No projeto |
| --- | --- |
| Injeção de prompt | Suíte de ataques; regras no prompt; detector para os traces |
| Vazamento do prompt do sistema | Canário; traces sem as entradas do modelo |
| Divulgação de dados sensíveis | Mascaramento antes do modelo e dos traces |
| Consumo sem limite | Limite por IP; histórico cortado em 20 mensagens; no máximo 4 passos por resposta |
| Confiança excessiva na saída | Preços conferidos contra as ferramentas |

## 6. Custo por requisição

`src/lib/pricing.ts` guarda os preços de lista e a data em que foram lidos. O custo é calculado **por passo, pelo modelo que realmente respondeu**, não pelo que foi pedido, porque o fallback pode trocar de modelo no meio. Num trace conferido, o Langfuse calculou o mesmo valor: US$ 0,00070.

## Exercícios

1. **Quebre o portão.** Tire a regra "não dê descontos" do prompt e rode `npm run eval`. Quais ataques passam a falhar? O deploy seria bloqueado?
2. **Roteamento medido.** Force todas as mensagens para o nível forte e rode a avaliação. Quanto o custo médio sobe? A qualidade melhora?
3. **Recusa demais.** No caso do cartão, o modelo recusou e não buscou o perfume. Como mudar o prompt para ele ajudar, sabendo que os dados já chegam mascarados? Escreva o caso de avaliação antes.
4. **Guardrail com modelo.** Quando valeria a pena usar um modelo para julgar a resposta de outro? Qual seria o custo por mensagem?
