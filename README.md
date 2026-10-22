# Lembrete MS

Crie lembretes por voz ou texto, revise data/horário e escolha a antecedência do alerta. Os dados ficam neste aparelho, sem conta ou banco remoto.

## Avisos e integração com o iPhone

| Recurso | Navegador / Tela de Início | Aplicativo iOS nativo |
| --- | --- | --- |
| Salvar e editar lembretes | Sim, neste navegador | Sim, neste aplicativo |
| Avisar no horário selecionado | Aviso na tela, enquanto o app estiver aberto e visível | Notificação local do iOS, inclusive com o app fechado ou bloqueado, após permissão |
| Salvar no Apple Lembretes | Abre Compartilhar; escolha Lembretes e confirme data, hora e alerta | EventKit preenche título, vencimento e alarme após permissão |
| Calendário | Arquivo `.ics` com evento de 30 minutos e alerta | Editor oficial do Calendário com Adicionar/Cancelar |

**Adicionar o site à Tela de Início não instala a versão nativa.** Este projeto ainda não tem servidor de Web Push. Safari/PWA não mantém temporizadores confiáveis com a página fechada. Para avisos web em segundo plano seriam necessários inscrições push, persistência no servidor e um agendador. Nenhum desses serviços é simulado pelo app.

### Como salvar

1. Preencha texto, data, horário e alerta. A antecedência **0** corresponde ao horário do compromisso.
2. Toque em **Salvar lembrete**. O registro local é gravado antes de solicitar permissões ou abrir outro aplicativo.
3. No iPhone, a opção **Salvar também no Lembretes do iPhone** vem selecionada. Na web, escolha **Lembretes** na folha de compartilhamento e confirme o horário e o alerta; compartilhar texto não configura automaticamente um alarme. Na versão nativa, autorize o acesso solicitado pelo iOS.
4. **Adicionar ao Calendário** continua disponível separadamente. O lembrete local permanece salvo se você cancelar o editor.

Na versão nativa, editar um lembrete vinculado também atualiza sua cópia no Apple Lembretes, mesmo que a preferência para criar novas cópias esteja desativada. Concluir/excluir cancela o aviso próprio e atualiza somente a cópia criada pelo Lembrete MS. Cópias criadas pela folha de compartilhamento e eventos adicionados ao Calendário são independentes; suas alterações devem ser feitas nesses aplicativos.

### Notificações

- Disparo em `dataHoraDoCompromisso - antecedência`, usando o horário escolhido no aparelho e instante persistido em UTC.
- Editar substitui o agendamento; concluir/excluir cancela. Se o novo agendamento falhar, o antigo não permanece armado no horário errado.
- **Configurações → Ativar notificações** cancela os avisos próprios ao desligar e reagenda os futuros ao ligar. Avisos já criados no Apple Lembretes ou Calendário têm controles independentes.
- **Testar notificação** programa um teste em 10 segundos. Na web, mantenha a tela aberta; no app nativo, o teste pode aparecer na tela bloqueada.
- Permissão negada, horário já passado, falha de armazenamento e erro na integração são informados sem apresentar sucesso falso.
- O iOS limita os pedidos locais pendentes a 64. O app prioriza os próximos, informa os demais e refaz a programação ao reabrir. Não há promessa de reabastecimento automático da fila com o app fechado.
- Avisos simultâneos dentro do app são apresentados em fila. Na web, não são reapresentados lembretes perdidos há mais de um minuto durante a suspensão da página.

## Desenvolvimento web

Requisito: **Node.js 22.12+** (Node 24 recomendado; Capacitor 8 requer Node 22+).

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. Produção:

```bash
npm test
npm run build
npm start
```

A publicação web continua usando Next.js/Vercel e o repositório existente. Não há novas variáveis de ambiente, contas ou serviços pagos necessários. A rota `app/api/calendario/route.ts` mantém a geração do `.ics`.

## Compilar e instalar a versão nativa iOS

O repositório já contém o projeto Xcode em `ios/App/App.xcodeproj`. Em um Mac com Xcode compatível com Capacitor 8:

```bash
npm ci
npm run cap:sync:ios
npm run cap:open:ios
```

O comando de sincronização primeiro gera a interface completa em `dist-native/` com Vite, reutilizando `app/page.tsx` e o CSS. Os arquivos são copiados para o app iOS. Isso substitui a antiga configuração que empacotava apenas uma página “Carregando”. O aplicativo pode iniciar e gerenciar os lembretes sem depender de um servidor Next.js.

No Xcode, selecione a equipe em **Signing & Capabilities**, conecte o iPhone, selecione-o como destino e execute o projeto. Distribuição por TestFlight/App Store depende da assinatura e da conta Apple correspondentes. Um deploy na Vercel **não instala nem atualiza o binário nativo**.

`CAPACITOR_SERVER_URL` continua disponível para desenvolvimento remoto explícito. Para empacotar a interface local de produção, deixe essa variável ausente.

### Integração Apple

- `AppleRemindersPlugin.swift`: EventKit, autorização iOS 17+ e compatibilidade com iOS 15/16, lembretes e editor do Calendário.
- `LembreteViewController.swift`: registra a ponte Capacitor; o storyboard aponta para esse controlador.
- `Info.plist`: justificativas de permissão de Lembretes e Calendário legado.
- `PrivacyInfo.xcprivacy`: declara o uso de preferências locais para guardar os vínculos.
- O registro nativo associa o ID do lembrete ao ID EventKit. A ponte não aceita um ID externo arbitrário para modificar dados de outros aplicativos.
- Não existe sincronização inversa automática das alterações feitas diretamente no app Lembretes. Se você apagar a cópia na Apple e salvar novamente no Lembrete MS, uma nova cópia é criada.

A transcrição continua usando o reconhecimento de voz disponível no navegador. Quando a plataforma não oferece esse recurso, a digitação permanece disponível. A API de notificações e o EventKit funcionam pela ponte nativa.

## Verificação

`npm test` cobre regras de horário, antecedência zero, migração dos registros locais, reagendamento e falhas, cancelamento, permissões, limites do iOS, timers longos, duplicidade e compartilhamento cancelado.

```bash
npm test
npm run build
npm run build:native
npm run cap:sync:ios
```

A ação **Validar integração iPhone** compila para simulador em macOS/Xcode, sem certificado ou segredo, nos PRs que alteram essa integração. Uma compilação de simulador não substitui o teste de permissões e notificações com o iPhone bloqueado.

Teste final no aparelho: salvar um lembrete para alguns minutos adiante com alerta zero, bloquear a tela e conferir a notificação; editar o horário e confirmar que o antigo foi cancelado; salvar no Apple Lembretes e conferir título, vencimento e alarme; repetir com permissão negada e verificar que o registro local permanece.

## Referências técnicas

- [Capacitor: Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- [Capacitor: Development Workflow](https://capacitorjs.com/docs/basics/workflow)
- [Apple: Creating events and reminders](https://developer.apple.com/documentation/eventkit/creating-events-and-reminders)
- [Apple: EventKit no iOS 17](https://developer.apple.com/documentation/technotes/tn3153-adopting-api-changes-for-eventkit-in-ios-macos-and-watchos)
- [Apple: compartilhar com Lembretes](https://support.apple.com/en-us/102484)
- [WebKit: Web Push no iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
