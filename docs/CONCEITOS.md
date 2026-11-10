# Conceitos do módulo 3, explicados pelo código

Guia de estudo em português: interfaces de IA, o front-end AI-first.

## 1. Generative UI: a IA escolhe o componente, você desenha o componente

Num chatbot comum, a IA responde com texto. Aqui ela responde chamando **ferramentas**, e cada ferramenta tem um componente visual:

| Ferramenta | Componente |
| --- | --- |
| `searchProducts` | Cards de produto + etiquetas com os filtros aplicados |
| `compareProducts` | Tabela de comparação com o melhor preço e a melhor avaliação destacados |
| `getProductDetails` | Ficha do produto |

A divisão de trabalho é o ponto central:
- **a IA decide** o que mostrar e com quais dados ("buscar notebooks ordenados por avaliação, depois comparar os 3 primeiros");
- **o front-end decide** como mostrar. A IA nunca gera HTML. Por isso o visual é consistente, acessível e testável.

Veja o `switch` de `MessagePart` em `src/components/shop.tsx`: é ali que uma "parte" da mensagem vira componente.

## 2. Como o AI SDK organiza isso

**No servidor** (`src/app/api/chat/route.ts`):
- `streamText` chama o modelo com o prompt de sistema, o histórico e as ferramentas;
- `stopWhen: stepCountIs(4)` permite até 4 etapas: buscar → comparar → responder. Sem limite, um modelo confuso poderia ficar chamando ferramentas em loop (e gastando);
- `toUIMessageStreamResponse()` devolve tudo em *streaming* para o navegador.

**No cliente** (`src/components/shop.tsx`):
- `useChat` cuida do estado da conversa: `messages`, `sendMessage`, `status`, `error`, `stop`;
- cada mensagem tem `parts`: texto, chamadas de ferramenta, raciocínio...;
- cada parte de ferramenta tem um **estado**: `input-streaming` (o modelo ainda está escrevendo os argumentos), `input-available` (a ferramenta está rodando), `output-available` (resultado pronto) ou `output-error`.

**Tipagem de ponta a ponta:** `InferUITools<typeof tools>` faz o TypeScript saber que `part.output` de `tool-searchProducts` tem `products`, `total` e `filters`. Se você mudar a ferramenta, o componente quebra na compilação, não em produção.

## 3. Streaming e estados de carregamento

Uma resposta de IA leva segundos. Os estados intermediários fazem a diferença entre "está funcionando" e "travou":
- **"Pensando…"** enquanto o modelo decide o que fazer;
- **cards "esqueleto"** (`ToolPending`) com o que está sendo buscado: "Buscando “running shoes”…";
- **botão "Parar"** no lugar de "Enviar" durante a resposta.

E para acessibilidade: `aria-live="polite"` faz o leitor de tela anunciar respostas novas, e `role="status"` marca os carregamentos.

## 4. A interface e o chat conversam nos dois sentidos

Os componentes que a IA gerou são vivos:
- **"Adicionar"** coloca o produto no carrinho de verdade (estado do React), sem chamar a IA;
- **"Detalhes"** manda uma mensagem para a IA ("Quero ver os detalhes do produto X"), que chama `getProductDetails`.

Isso é feito com um *Context* do React (`src/components/shop-context.tsx`), que dá aos componentes gerados acesso ao carrinho e à função `ask`. Repare que "Adicionar" não gasta IA: **nem toda interação precisa passar pelo modelo**. Decidir o que é determinístico e o que é IA é uma decisão de arquitetura.

## 5. Grounding num chat

A mesma regra do módulo 2: a IA só fala de produtos que vieram de uma ferramenta. Está no prompt de sistema (`SYSTEM_PROMPT` em `src/lib/tools.ts`). Um detalhe: o catálogo está em inglês e o cliente escreve em português. A descrição da ferramenta pede ao modelo para **traduzir a busca** ("tênis de corrida" → "running shoes sneakers"). É um remendo consciente: no módulo 6, a busca semântica com embeddings resolve isso de verdade.

## 6. Confiabilidade: fallback, timeout e limite de uso

O plano gratuito do Gemini falhou de três jeitos durante os testes, e cada um ensinou algo (veja `src/lib/model.ts`):

1. **503 "alta demanda"** → *fallback*: a mesma pergunta vai para outro modelo. Como cada modelo tem cota própria, a cadeia também multiplica a capacidade diária.
2. **429 cota esgotada** → também fallback, pelo mesmo motivo.
3. **Conexão que abre e não manda nada** → o pior caso: sem erro, a tela fica em "Pensando…" para sempre. A solução é um *timeout* de 15 s **até o primeiro conteúdo**. Primeiro tentei medir só a abertura da conexão, mas ela chega na hora mesmo quando nada vem depois. O teste com navegador mostrou isso; agora há um teste automático para cada caso.

Tudo isso é implementado como **middleware** do AI SDK (`wrapLanguageModel`): o resto do código nem sabe que existe fallback. É o mesmo padrão de *middleware* que você conhece de Express ou de interceptors do Axios.

Mais duas proteções em `src/app/api/chat/route.ts`:
- **Rate limit por visitante** (12 mensagens a cada 10 min): numa demo pública com chave gratuita, um visitante (ou um robô) poderia gastar a cota do dia de todo mundo.
- **Erros legíveis**: o cliente nunca vê o erro técnico da API, só uma frase em português e um botão "Tentar de novo".

## 7. Custo por mensagem

Toda mensagem do cliente custa chamadas ao modelo, e cada etapa (buscar, comparar, responder) é uma chamada. Por isso:
- `stepCountIs(4)` limita as etapas;
- só as últimas 20 mensagens vão para o modelo;
- o prompt pede texto curto, porque os componentes já mostram os dados e tokens de saída são os mais caros;
- o modelo principal é o mais barato que passou no benchmark do módulo 2.

## Exercícios para fixar

1. Mude `stepCountIs(4)` para `stepCountIs(1)` e peça uma comparação. O que acontece? Por quê?
2. Crie uma ferramenta `suggestGift({ budget, interest })` e um componente para ela. Repare em quantos lugares você precisa mexer, e em quantos o TypeScript avisa sozinho.
3. Em `src/lib/model.ts`, mude `FIRST_BYTE_TIMEOUT_MS` para 1000 (1 s). O que acontece com as respostas? Qual o risco de um timeout curto demais?
4. Abra o DevTools → Network, mande uma mensagem e inspecione a resposta de `/api/chat`. Você vai ver o stream chegando em pedaços: texto, chamada de ferramenta, resultado.
