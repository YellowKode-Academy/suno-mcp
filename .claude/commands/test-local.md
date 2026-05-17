Testa o suno-mcp localmente sem publicar no npm.

1. Build e testes unitários:
   ```bash
   cd suno-mcp
   npm run build
   npm test
   ```
   Espera: todos os testes passando (config.test.ts + startup.test.ts).

2. Para testar como MCP client via Claude Code, adicione ao `.mcp.json` na raiz do workspace:
   ```json
   {
     "mcpServers": {
       "suno-local": {
         "command": "node",
         "args": ["dist/index.js"],
         "cwd": "./suno-mcp",
         "env": { "SUNO_API_KEY": "sua_key_aqui" }
       }
     }
   }
   ```

3. Reinicie o Claude Code para carregar o novo MCP server.

4. Teste com: "Verifique meus créditos do Suno" — deve retornar os créditos restantes.

5. Teste de geração básica: "Gere uma música lo-fi relaxante, sem vocais"
   → Claude deve chamar `generate_music` e depois `wait_for_music` automaticamente.
