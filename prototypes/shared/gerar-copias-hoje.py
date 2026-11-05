"""Gera as cópias de composição de 01-hoje-extensao.html.

Cada cópia é o arquivo base + folhas de composição (shared/hoje-*.css)
carregadas, em ordem, depois do <style> da página. Edite a base ou a folha e rode de novo:

    python prototypes/shared/gerar-copias-hoje.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / '01-hoje-extensao.html'

COPIES = [
    ('01a-hoje-recolhida.html', 'hoje-recolhida', 'Hoje — A · Recolhida', ['hoje-recolhida.css']),
    ('01c-hoje-assimetrica.html', 'hoje-assimetrica', 'Hoje — C · Assimétrica', ['hoje-assimetrica.css']),
    ('01d-hoje-eixo.html', 'hoje-eixo', 'Hoje — D · Eixo', ['hoje-periferia.css', 'hoje-eixo.css']),
    ('01e-hoje-assimetrica-cartao.html', 'hoje-assimetrica-cartao', 'Hoje — E · Assimétrica com cartão', ['hoje-periferia.css', 'hoje-assimetrica-cartao.css']),
]


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit(f'Trecho esperado uma vez na base: {old!r}')
    return text.replace(old, new)


def main():
    base = BASE.read_text(encoding='utf-8')
    for file, pid, title, sheets in COPIES:
        links = ''.join(f'<link rel="stylesheet" href="shared/{css}">\n' for css in sheets)
        t = base
        t = replace_once(t, '<title>Ora · Hoje (extensão)</title>', f'<title>Ora · {title}</title>')
        t = replace_once(t, '</style>\n</head>', f'</style>\n<!-- Cópia gerada de 01-hoje-extensao.html por shared/gerar-copias-hoje.py -->\n{links}</head>')
        t = replace_once(t, "id: 'hoje-extensao',", f"id: '{pid}',")
        t = replace_once(t, "title: 'Hoje — extensão',", f"title: '{title}',")
        t = replace_once(t, 'href="01-hoje-extensao.html" aria-current="page"', f'href="{file}" aria-current="page"')
        (ROOT / file).write_text(t, encoding='utf-8', newline='')
        print('gerado', file)


if __name__ == '__main__':
    main()
