# Pôr o bot online 24/7, de graça, na Oracle Cloud

Este guia põe o **bot autónomo** (`server/index.ts`) a correr sozinho num
servidor, sem precisares de ter a app desktop aberta. É a mesma lógica de
sempre (backups agendados, sorteios, jogos, economia, pontos de Mov. Call)
— só que corre num computador que nunca desligas, em vez do teu.

A app desktop continua a existir na mesma para gerires tudo visualmente
(backups, moderação, mensagens) sempre que quiseres — só não se pode ligar
**ao mesmo tempo** que o bot autónomo com o mesmo token (ver secção
"Importante" no fim).

Porquê Oracle Cloud? É a única cloud com um nível **"Always Free"**
verdadeiramente gratuito para sempre, sem cartão a ser cobrado e sem
limite de tempo — ao contrário de Railway, Render ou Fly.io, que hoje em
dia exigem plano pago ou cartão para correr algo 24 horas por dia.

## 1. Criar a conta e a máquina virtual

1. Cria conta em [cloud.oracle.com](https://www.oracle.com/cloud/free/) — pede cartão só para verificar identidade, nunca cobra a não ser que faças upgrade manual para "Pay As You Go".
2. No painel, vai a **Compute → Instances → Create Instance**.
3. Em **Image and shape**, escolhe:
   - Imagem: **Ubuntu 22.04** (ou mais recente disponível)
   - Forma (shape): clica em **Change shape** → **Ampere** → `VM.Standard.A1.Flex` → define **1 OCPU** e **6 GB de RAM** (a parte "Always Free" cobre até 4 OCPU / 24 GB no total, gratuito para sempre)
4. Em **Add SSH keys**, deixa a Oracle gerar um par de chaves e descarrega a chave privada (`.key`) — vais precisar dela para entrar por SSH.
5. Cria a instância e espera que fique "Running". Anota o IP público.

## 2. Entrar por SSH e instalar o Docker

```bash
chmod 600 caminho/para/a-tua-chave.key
ssh -i caminho/para/a-tua-chave.key ubuntu@IP_DA_MAQUINA
```

Dentro da máquina:

```bash
# Docker + Docker Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Git
sudo apt-get update && sudo apt-get install -y git
```

## 3. Trazer o código e configurar o token

```bash
git clone https://github.com/thiagodanjos/lisdiscord.git
cd lisdiscord
cp .env.example .env
nano .env   # cola o token do bot a seguir a DISCORD_TOKEN=
```

O `.env` fica só nesta máquina — nunca é enviado para o GitHub.

## 4. Arrancar o bot

```bash
docker compose up -d --build
```

Isto constrói a imagem e arranca o container em segundo plano, já com
`restart: unless-stopped` — se a máquina reiniciar ou o processo cair, o
Docker volta a arrancá-lo sozinho.

Confirma que ligou:

```bash
docker compose logs -f
```

Deves ver algo como:

```
✅ LisDiscord (bot autónomo) ligado como LisDiscord Bot#0421 — 2 servidor(es).
🟢 Bot a correr — não é preciso ter a app desktop aberta enquanto este processo estiver de pé.
```

`Ctrl+C` só sai dos logs — o bot continua a correr.

## 5. Garantir que sobrevive a um reboot da máquina

```bash
sudo systemctl enable docker
```

Assim o Docker arranca sozinho quando a VM reinicia (por exemplo depois
de uma manutenção da Oracle), e o container reinicia com ele.

## Atualizar para uma nova versão

```bash
cd lisdiscord
git pull
docker compose up -d --build
```

## Comandos úteis

```bash
docker compose logs -f        # ver os logs em direto
docker compose restart        # reiniciar o bot
docker compose stop           # parar o bot
docker compose up -d          # voltar a arrancar
docker compose down           # parar e remover o container (os dados na volume mantêm-se)
```

## Importante — não ligar em dois sítios ao mesmo tempo

O token do bot só deve estar ligado **num sítio de cada vez**. Se ligares a
app desktop com o mesmo token enquanto o bot autónomo também está a
correr no servidor, os dois vão receber os mesmos comandos e sorteios em
duplicado, o Discord vai recusar a segunda resposta a cada interação
("A interação falhou"), e — mais traiçoeiro ainda — cada lado vai gravar as
alterações no seu próprio ficheiro local, por isso o que configurares na
app pode nunca chegar ao bot que está mesmo a atender o servidor.

Para fazeres alguma gestão a partir da app desktop (um backup manual,
mensagens, moderação) enquanto o bot autónomo está online:

```bash
# no servidor, antes de abrires a app desktop com o token
docker compose stop

# ... usa a app desktop normalmente ...

# quando acabares, volta a ligar o servidor
docker compose start
```

Para tudo o que já tem comando no Discord — jogos, economia, `/movcall`,
`/movhoras`, `/pontosmov` — não precisas de tocar em nada disto: o bot
autónomo trata de tudo sozinho, o tempo todo.

### Justificativas — geri-las pela app sem parar o bot

Para a página **Justificativas** da app especificamente, não precisas da
dança de parar/arrancar o servidor: ativa a API remota (secção seguinte) e a
app fala diretamente com o bot que já está a correr, em vez de abrir a sua
própria ligação. As outras páginas da app continuam a precisar do
`docker compose stop` acima enquanto não tiverem o mesmo suporte.

## API remota (opcional) — gerir Justificativas pela app sem parar o bot

1. No `.env` do servidor, define uma chave secreta longa e aleatória:

   ```bash
   echo "LISDISCORD_API_KEY=$(openssl rand -hex 32)" >> .env
   docker compose up -d --build
   ```

2. Confirma nos logs (`docker compose logs --tail=20`) que aparece algo como
   `🌐 API remota a ouvir na porta 8787`.

3. Na Oracle Cloud, abre a porta 8787 na regra de firewall da tua instância
   (idealmente restrita só ao teu próprio IP, não a `0.0.0.0/0` — a API não
   tem HTTPS embutido, por isso a chave viaja em texto simples na rede; abrir
   só ao teu IP é a única proteção extra que tens).

4. Na app desktop, em **Justificativas → Bot remoto**, mete o endereço
   (`http://IP_DO_SERVIDOR:8787`) e a chave que geraste no passo 1.

A partir daí, a página Justificativas passa a falar diretamente com o bot do
servidor — nunca mais precisas de repetir a configuração nem de sincronizar
ficheiros manualmente.

## Dados

Os dados do bot (backups, economia, pontos de Mov. Call, etc.) ficam
numa Docker volume (`lisdiscord-data`), persistente entre reinícios e
atualizações. Para veres o conteúdo:

```bash
docker run --rm -v lisdiscord_lisdiscord-data:/data alpine ls -la /data
```
