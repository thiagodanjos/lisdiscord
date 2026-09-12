# Pôr o bot online 24/7, de graça, na Google Cloud

Alternativa ao [guia da Oracle Cloud](deploy-oracle.md) — usa exatamente o
mesmo `Dockerfile` e `docker-compose.yml`, só muda onde a máquina é criada.
Vale a pena teres as duas opções à mão: a Oracle tem máquinas maiores
(6 GB de RAM) mas sofre com falta de capacidade para a forma gratuita; a
Google Cloud é mais pequena (1 GB de RAM) mas normalmente tem sempre
máquina disponível, sem aquele erro de "Out of host capacity".

## O nível Always Free da Google Cloud

Tal como a Oracle, a Google também tem um nível **"Always Free"**
genuinamente gratuito para sempre (além dos 300$ de crédito de teste
por 90 dias, que é à parte): uma máquina `e2-micro`, com 30 GB de disco,
mas só nestas três regiões dos EUA:

- `us-west1` (Oregon)
- `us-central1` (Iowa)
- `us-east1` (Carolina do Sul)

Fica mais longe de Portugal do que a Oracle em Madrid (mais uns
milissegundos de latência), mas isso não se nota em comandos do Discord.

**Sobre pagamentos:** o cartão pedido no registo serve só para verificar
identidade — a Google nunca cobra automaticamente. Como na Oracle, só é
cobrado alguma coisa se tu próprio clicares num botão explícito de upgrade
para conta paga.

## 1. Criar a conta e o projeto

1. Vai a [cloud.google.com/free](https://cloud.google.com/free) e clica em **"Get started for free"**.
2. Regista-te com a tua conta Google (ou cria uma).
3. Confirma o cartão para verificação de identidade.
4. No painel (console.cloud.google.com), cria um novo projeto: menu do topo → **"New Project"** → dá-lhe um nome (ex.: `lisdiscord`) → **Create**.

## 2. Criar a máquina virtual

1. No menu ☰ (hambúrguer), vai a **Compute Engine → VM instances**.
2. Se for a primeira vez, espera que a API do Compute Engine ative sozinha (pode pedir para clicares em "Enable").
3. Clica em **"Create Instance"**.
4. Preenche:
   - **Name**: `lisdiscord-bot`
   - **Region**: escolhe uma das três acima — `us-central1` (Iowa) é uma boa escolha central
   - **Zone**: qualquer uma dessa região (ex.: `us-central1-a`)
   - Em **Machine configuration**: série **E2**, tipo de máquina **e2-micro**
5. Em **Boot disk**, clica em **"Change"**:
   - Sistema operativo: **Ubuntu**
   - Versão: **Ubuntu 22.04 LTS**
   - Tipo de disco: **Standard persistent disk** (não SSD — o SSD sai do limite gratuito)
   - Tamanho: até 30 GB (o valor por defeito já serve)
   - Clica em **"Select"**
6. Em **Firewall**, não precisas de marcar nada (o bot só faz ligações de saída para o Discord, não recebe pedidos de fora).
7. Clica em **"Create"** no fundo da página.

A máquina fica pronta em menos de um minuto — a Google raramente tem
problemas de capacidade para `e2-micro`, por ser uma forma comum.

## 3. Entrar por SSH

A Google torna isto mais simples do que a Oracle — não precisas de
gerir chaves manualmente:

1. Na lista de VM instances, ao lado da tua máquina, clica no botão **"SSH"**.
2. Abre uma janela de terminal diretamente no browser, já ligado à máquina.

(Se preferires usar o teu próprio terminal, a Google também suporta `gcloud compute ssh`, mas o botão no browser é o caminho mais direto.)

## 4. Instalar Docker e Git

Dentro do terminal SSH (igual à Oracle):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
sudo apt-get update && sudo apt-get install -y git
```

## 5. Trazer o código e configurar o token

```bash
git clone https://github.com/thiagodanjos/lisdiscord.git
cd lisdiscord
cp .env.example .env
nano .env   # cola o token do bot a seguir a DISCORD_TOKEN=
```

## 6. Arrancar o bot

```bash
docker compose up -d --build
docker compose logs -f
```

Deves ver:

```
✅ LisDiscord (bot autónomo) ligado como LisDiscord Bot#0421 — 2 servidor(es).
🟢 Bot a correr — não é preciso ter a app desktop aberta enquanto este processo estiver de pé.
```

## 7. Sobreviver a reinícios da máquina

```bash
sudo systemctl enable docker
```

## Atualizar / comandos úteis

Exatamente os mesmos do guia da Oracle:

```bash
git pull && docker compose up -d --build   # atualizar para nova versão
docker compose logs -f                      # ver logs em direto
docker compose restart                      # reiniciar
docker compose stop / start                 # parar / voltar a ligar
```

## Limite a ter em atenção: tráfego de rede

O nível Always Free inclui **1 GB de tráfego de saída por mês** (fora da
própria região). Para um bot normal — comandos, embeds, jogos — isto
costuma chegar perfeitamente, porque as mensagens trocadas com o Discord
são pequenas (texto e JSON). Só seria um problema se enviasses muitos
ficheiros grandes ou imagens pesadas constantemente. Se algum dia
precisares de mais, a Google cobra o excedente a preços baixos — nunca
corta o bot sem avisar primeiro por email.

## Importante — o mesmo aviso do guia da Oracle

Não ligues a app desktop com o mesmo token enquanto este bot autónomo
estiver a correr (nem aqui nem lá) — os dois receberiam os mesmos
comandos em duplicado. Para gestão pela app desktop, para o container
primeiro (`docker compose stop`), usa a app, e depois volta a arrancar
(`docker compose start`).
