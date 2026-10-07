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

**Sobre pagamentos:** o cartão pedido no registo serve para verificar
identidade. Durante o teste nada é cobrado; depois do upgrade para conta
completa (necessário para a VM não parar), só pagas o que passar do nível
gratuito — com as dicas de [Ficar sempre no nível gratuito](#ficar-sempre-no-nível-gratuito-sem-pagar-nada)
e um alerta de orçamento de 1 €, fica em 0.

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
git pull && docker compose up -d --build && docker system prune -f   # atualizar (e limpar imagens velhas)
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

## Ficar sempre no nível gratuito (sem pagar nada)

A `e2-micro` em `us-west1`/`us-central1`/`us-east1` com disco **Standard**
até 30 GB é grátis para sempre. O que costuma gerar custos é o que vem
ligado por omissão ou se acumula:

- **Programação de snapshots** — ao criar a VM, a Google pode associar ao
  disco uma *snapshot schedule* (`default-schedule-1`). Os snapshots **não**
  entram no nível gratuito. Para a tirar: **Compute Engine → Armazenamento →
  Snapshots → separador "Programações de snapshots"** → seleciona a
  programação → **Desanexar** do disco e depois **Eliminar**; apaga também
  os snapshots que já existam no separador **Snapshots**.
- **Disco cheio de imagens velhas** — cada `docker compose up -d --build`
  deixa camadas antigas. Usa sempre `docker system prune -f` depois de
  atualizar (o disco de 10 GB chega bem assim).
- **Pouca RAM (1 GB)** — se o build ficar lento ou falhar, cria um swap de 1 GB
  uma vez:

  ```bash
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

- **Fim do período de teste (90 dias / 300$)** — antes de acabar, carrega em
  **Ativar conta completa** (upgrade). Sem isso a VM é **parada** quando o
  teste termina. O upgrade não te cobra nada enquanto ficares dentro do
  nível gratuito; os créditos que sobrarem continuam a ser usados primeiro.
- **Alerta de orçamento** — em **Faturação → Orçamentos e alertas**, cria um
  orçamento de **1 €** com alertas a 50 %, 90 % e 100 %. Se algo começar a
  custar dinheiro, recebes um email logo.

Em **Faturação → Relatórios** (agrupar por *SKU*) vês exatamente o que está
a gastar — com tudo certo, o custo líquido fica em 0.

## Importante — app desktop + bot autónomo

Não ligues a app desktop com o mesmo token **em modo normal** enquanto este
bot estiver a correr — os dois responderiam aos mesmos comandos. Em vez
disso, ativa a API remota (`LISDISCORD_API_KEY` no `.env`) e liga a app ao
bot em **Equipa → Justificativas → Bot remoto**: a ligação local da app fica
passiva e todas as páginas passam a gerir diretamente este bot.
