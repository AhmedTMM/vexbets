# vexbets

Prediction markets on what your friends say. Someone wears a Vexo band, you open a
market ("Will Sam say 'no cap' before midnight?"), friends trade Yes/No like on Kalshi, the
band's microphone is transcribed, and an OpenAI judge resolves the market by quoting the
transcript lines that prove it.

| Folder                     | What                                                         | Owner     |
| -------------------------- | ------------------------------------------------------------ | --------- |
| [`contract/`](contract/)   | Shared types, schemas, pricing and proof checks. Start here. | both      |
| [`backend/`](backend/)     | API, Postgres, ingest, judge                                 | backend   |
| [`dashboard/`](dashboard/) | Trading UI and the band listener page                        | dashboard |

TypeScript everywhere, deployed on Vercel. Uses play-money credits.

## Develop

    npm install
    npm run check      # lint + typecheck + tests, the same as CI

The Vexo kit is a reference, cloned next to the code and not committed:

    git clone https://github.com/VexoAI-Org/vexo-open-kit.git
