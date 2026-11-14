# vexbets

Experiments with a Vexo Open band, built on the [Vexo Open kit](https://github.com/VexoAI-Org/vexo-open-kit).

## Setup

    git clone https://github.com/VexoAI-Org/vexo-open-kit.git
    python3 -m pip install bleak
    cp .env.example .env   # add your team's keys; never commit .env

Dashboard: `python3 -m http.server 8000 --bind 127.0.0.1`, then open
<http://localhost:8000/vexo-open-kit/dashboard/?band=NN> (your band number).
