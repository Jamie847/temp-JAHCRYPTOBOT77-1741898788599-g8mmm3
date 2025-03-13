declare module '@mistralai/mistralai' {
  export class MistralClient {
    constructor(apiKey: string);

    chat(params: {
      model: string;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{
      choices: Array<{ message: { content: string } }>;
    }>;

    embeddings(params: {
      model: string;
      input: string;
    }): Promise<{
      data: Array<{ embedding: number[] }>;
    }>;
  }
}