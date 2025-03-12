from collections import Counter
import json

# open output/diff.json
with open('output/diff.json') as f:
    diff = json.load(f)

    # gather the items into a flat list
    items = []
    if isinstance(diff, list):
        items = diff
    else:
        for value in diff.values():
            items.extend(value["items"])

    keys = []
    for item in items:
        diff_item = item['diff']
        kind = diff_item['kind']
        if kind == 'A':
            index = diff_item['index']
            keys.append(f'{diff_item["path"]}/{index}')
        else:
            keys.append(diff_item['path'])

    counter = Counter(keys)
    assert all(val == 1 for val in counter.values())
    print(f'{len(counter)} unique paths')