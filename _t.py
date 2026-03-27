import zipfile, os, json

def count_tags(node, counts=None):
    """Recursively count all tags in the serialized DOM"""
    if counts is None:
        counts = {}
    if not isinstance(node, list) or len(node) < 1:
        return counts
    tag = str(node[0]) if node[0] else ''
    counts[tag] = counts.get(tag, 0) + 1
    for child in (node[2:] if len(node) > 2 else []):
        if isinstance(child, list):
            count_tags(child, counts)
    return counts

def find_aria(node, results=None, depth=0):
    """Find elements with aria-label, role, or placeholder"""
    if results is None:
        results = []
    if not isinstance(node, list) or len(node) < 1 or depth > 15:
        return results
    tag = str(node[0]) if node[0] else ''
    attrs = node[1] if len(node) > 1 and isinstance(node[1], dict) else {}
    children = node[2:] if len(node) > 2 else []
    keys = ('aria-label', 'role', 'placeholder', 'aria-placeholder', 'contenteditable', 'name', 'type')
    if tag.upper() in ('INPUT', 'TEXTAREA', 'SELECT', 'BUTTON') or any(attrs.get(k) for k in keys):
        show = {k: attrs[k] for k in keys if attrs.get(k)}
        if 'class' in attrs:
            show['class'] = attrs['class'][:80]
        results.append(f'{"  "*depth}<{tag}> {show}')
    for child in children:
        if isinstance(child, list):
            find_aria(child, results, depth+1)
    return results

traces = [
    ('TC2', 'test-results/recorded-TC2_CreateSchedul-9c3c4--send-direct-message-action-chromium-retry1/trace.zip'),
    ('TC3', 'test-results/recorded-TC3_CreateFlowSen-abdd6-erflow-with-SendMail-action-chromium-retry1/trace.zip'),
]

for tc, path in traces:
    if not os.path.exists(path):
        print(tc + ' NOT FOUND'); continue
    print(f'\n=== {tc} ===')
    with zipfile.ZipFile(path) as z:
        for fname in z.namelist():
            if fname != '0-trace.trace':
                continue
            raw = z.read(fname)
            snapshots = []
            for line in raw.split(b'\n'):
                if not line.strip(): continue
                try:
                    ev = json.loads(line)
                    if ev.get('type') == 'frame-snapshot':
                        snapshots.append(ev)
                except:
                    pass
            edit_snaps = [(i, s) for i, s in enumerate(snapshots)
                          if '/edit' in s.get('snapshot', {}).get('frameUrl', '')
                          and 'flow.localzoho.com' in s.get('snapshot', {}).get('frameUrl', '')]
            print(f'Edit-page snapshots: {len(edit_snaps)}')
            if not edit_snaps:
                break
            idx, snap = edit_snaps[-1]
            html = snap.get('snapshot', {}).get('html', [])
            counts = count_tags(html)
            print('Tag counts (sorted by frequency):')
            for t, c in sorted(counts.items(), key=lambda x: -x[1])[:30]:
                print(f'  {t}: {c}')
            print('\nAll ARIA/interactive elements (depth <= 15):')
            items = find_aria(html)
            print(f'  Found {len(items)} items')
            for it in items[:100]:
                print(' ', it)
            break
