# Lembrete Voz

Aplicativo web simples para criar lembretes por voz, revisar o texto, escolher data/horário e abrir um evento preparado no Calendário do iPhone por meio de um arquivo `.ics`.

## O que já está pronto

- Gravação/transcrição pelo reconhecimento de voz disponível no navegador.
- Campo de texto editável e sem texto de exemplo.
- Sugestão automática de data e horário para frases simples, como:
  - `amanhã às 8`
  - `hoje às 19:30`
  - `daqui a 40 minutos`
  - `daqui a 2 horas`
- Campos de data, horário e antecedência do alerta.
- Botão **Adicionar ao Calendário** habilitado somente após preencher texto, data e horário.
- Geração do `.ics` em rota de servidor: `app/api/calendario/route.ts`.
- Evento com duração de 30 minutos e alerta configurável.
- Lista local de lembretes: Hoje, Próximos e Atrasados.
- Dados armazenados somente no navegador do aparelho, sem conta e sem banco de dados.
- Layout otimizado para celular e instalação na tela inicial do iPhone.

## Rodar no computador

Requisito: Node.js 20.9 ou superior.

```bash
npm install
npm run dev
```

Abra no navegador:

```text
http://localhost:3000
```

Para testar a versão de produção:

```bash
npm run build
npm start
```

## Colocar no GitHub usando o GitHub Desktop

1. Descompacte a pasta `lembrete-voz` em um local fácil, por exemplo Documentos.
2. Abra o GitHub Desktop.
3. Vá em **File > Add local repository** e selecione a pasta.
4. Caso apareça que a pasta ainda não é um repositório, escolha **Create a repository here**.
5. Faça o primeiro commit com a mensagem `Aplicativo Lembrete Voz`.
6. Clique em **Publish repository**.
7. Deixe como privado ou público, conforme preferir.

## Abrir e editar no Cursor

1. Abra o Cursor.
2. Clique em **Open Folder**.
3. Escolha a pasta `lembrete-voz`.
4. Rode no terminal do Cursor:

```bash
npm install
npm run dev
```

A tela principal está em `app/page.tsx` e o visual em `app/globals.css`.

## Publicar na Vercel

1. Entre na Vercel com a conta vinculada ao GitHub.
2. Clique em **Add New > Project**.
3. Importe o repositório `lembrete-voz`.
4. A Vercel reconhecerá o Next.js automaticamente.
5. Clique em **Deploy**.

Não é necessário configurar Supabase, banco de dados ou variáveis de ambiente.

## Instalar no iPhone

1. Abra o endereço publicado no Safari.
2. Toque no botão de compartilhar.
3. Escolha **Adicionar à Tela de Início**.
4. Abra o aplicativo pelo ícone criado.

Na primeira vez que usar o calendário, o aplicativo explicará que o iPhone abrirá o evento preparado e que é necessário tocar em **Adicionar** para confirmar.

## Observação sobre voz

O aplicativo usa o recurso de reconhecimento de voz fornecido pelo navegador. Caso ele não esteja disponível ou o acesso ao microfone seja negado, o texto continua podendo ser digitado manualmente.
