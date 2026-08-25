// Transforma a lista FLAT de categorias da API numa lista em ORDEM
// hierárquica com rótulos prontos pra exibição:
//
//   [Alimentação, Transporte, Delivery(parent=Alimentação)]
//     → [ {label: "Alimentação"},
//         {label: "Alimentação › Delivery", depth: 1},
//         {label: "Transporte"} ]
//
// Por que no front e não na API? A API entrega DADOS (a relação parent_id);
// como exibir — ordem, símbolo "›", indentação — é apresentação. A mesma
// regra do agrupamento por dia na timeline.
export function hierarchize(categories) {
  const roots = categories
    .filter((c) => c.parent_id == null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  const out = []
  const seen = new Set()
  for (const root of roots) {
    out.push({ ...root, label: root.name, depth: 0 })
    seen.add(root.id)
    const children = categories
      .filter((c) => c.parent_id === root.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    for (const child of children) {
      out.push({ ...child, label: `${root.name} › ${child.name}`, depth: 1 })
      seen.add(child.id)
    }
  }
  // segurança: se alguma filha ficou órfã na lista (mãe filtrada fora),
  // ela ainda aparece — nunca "sumir" com dados por causa de exibição
  for (const c of categories) {
    if (!seen.has(c.id)) out.push({ ...c, label: c.name, depth: 0 })
  }
  return out
}
