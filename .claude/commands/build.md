Build o pacote TypeScript e verifica se está tudo ok para publicar.

Passos:
1. Rode `npm install` se node_modules não existe
2. Rode `npm run build` para compilar TypeScript
3. Verifique se `dist/index.js` foi gerado
4. Cheque se o shebang `#!/usr/bin/env node` está no topo do dist/index.js
5. Se não tiver shebang, adicione no topo do arquivo compilado
6. Teste executando `node dist/index.js` e verifique se a mensagem de erro de SUNO_API_KEY aparece (sem crash)
7. Reporte o resultado: tamanho do bundle, arquivos gerados
