"""Generate original, artificial workflow inputs; these are not inferred trees."""
import hashlib
import json
from pathlib import Path


def balanced(names, *, support='', ages=False):
    if len(names) == 1:
        return names[0], 0
    middle = len(names) // 2
    left, a = balanced(names[:middle], support=support, ages=ages)
    right, b = balanced(names[middle:], support=support, ages=ages)
    height = max(a, b) + 1
    annotation = (f'[&height={height},height_95%_HPD={{{height * .8:g},{height * 1.2:g}}}]'
                  if ages else support)
    return f'({left}:{height-a},{right}:{height-b}){annotation}', height


def generate(directory):
    directory.mkdir(exist_ok=False)
    names = lambda count: [f'Taxon_{i:03d}' for i in range(1, count + 1)]
    tree = lambda count, **options: balanced(names(count), **options)[0] + ';'
    conflict_names = names(12)
    conflict_names[1], conflict_names[3] = conflict_names[3], conflict_names[1]
    input_tree = lambda name, content: {'name': name, 'content': content}
    cases = [
        {'id': 'ordinary-58', 'spec': {'workspace': 'phylogeny',
         'main_tree': input_tree('ordinary-58.nwk', tree(58, support='0.95')),
         'options': {'support': {'scale': 'probability'}}}},
        {'id': 'dating-27', 'spec': {'workspace': 'time',
         'main_tree': input_tree('dating-27.nwk', tree(27, ages=True)),
         'options': {'time': {'source_unit': 'mya', 'age_source': 'height', 'geology': 'none'}}}},
        {'id': 'conflict-12', 'spec': {'workspace': 'conflict',
         'main_tree': input_tree('primary-12.nwk', tree(12, support='0.95')),
         'comparison_tree': input_tree('comparison-12.nwk', balanced(conflict_names, support='90')[0] + ';'),
         'options': {'conflict': {'primary_support_scale': 'probability', 'secondary_support_scale': 'percent'}}}},
        {'id': 'cloud-5', 'spec': {'workspace': 'cloud',
         'main_tree': input_tree('dated-reference-5.nwk', '(O:10,((A:2,B:2):3,(C:1,D:1):4):5);'),
         'gene_trees': input_tree('artificial-branches.trees',
           '(O:4,((A:1,B:1)1:1,(C:1,D:1)1:1)1:2);\n'
           '(O:4,((A:1,C:1)1:1,(B:1,D:1)1:1)1:2);\n(O:3,(A:1,C:1)1:2);'),
         'options': {'cloud': {'species_method': 'dated', 'dated_unit': 'relative',
           'dated_age_source': 'branch_lengths', 'genes_method': 'ml',
           'phyparts_scale': 'probability', 'show_gene': True, 'pie_mode': 'four'}}}},
    ]
    entries = []
    for case in cases:
        case.update(synthetic=True, inferential_claim='none',
                    input_origin='Original deterministic artificial topology, lengths, supports and intervals')
        payload = (json.dumps(case, indent=2) + '\n').encode()
        filename = case['id'] + '.json'
        (directory / filename).write_bytes(payload)
        entries.append({'file': filename, 'sha256': hashlib.sha256(payload).hexdigest()})
    (directory / 'manifest.json').write_text(json.dumps({'schema': 1, 'cases': entries}, indent=2) + '\n')


if __name__ == '__main__':
    generate(Path(__file__).resolve().parent / 'fixtures')
