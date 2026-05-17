Publica o pacote @yellowkode/suno-mcp no npm.

Pré-requisitos (verifique antes de continuar):
1. Certifique que está logado no npm: `npm whoami` (deve retornar `yellowkode`)
2. Verifique a versão atual no `package.json`
3. Pergunte ao usuário: é patch (bug fix), minor (novo feature) ou major (breaking change)?

Passos:

4. Se o `suno-mcp-core` foi atualizado, atualize o vendor tarball ANTES de publicar:
   ```bash
   cd ../suno-mcp-core
   npm run build
   npm pack
   mv yellowkode-suno-mcp-core-*.tgz ../suno-mcp/vendor/
   cd ../suno-mcp
   npm install   # atualiza package-lock com o novo tarball
   ```

5. Atualize a versão:
   ```bash
   npm version [patch|minor|major]
   ```

6. Rode build + testes:
   ```bash
   npm run build
   npm test
   ```

7. Confirme com o usuário antes de publicar.

8. Execute:
   ```bash
   npm publish --access public
   ```

9. Confirme que o pacote está disponível: https://www.npmjs.com/package/@yellowkode/suno-mcp

10. Faça commit e push com a versão atualizada.
