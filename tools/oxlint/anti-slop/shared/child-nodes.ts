import type { ESTree } from "vite-plus/lint/plugins";

export type VisitorKeys = Readonly<Record<string, readonly string[]>>;

function isNode(value: unknown): value is ESTree.Node {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof value.type === "string"
	);
}

export function childNodes(
	node: ESTree.Node,
	visitorKeys: VisitorKeys,
): readonly ESTree.Node[] {
	const fields = new Map<string, unknown>(Object.entries(node));
	return (visitorKeys[node.type] ?? []).flatMap((key) => {
		const value = fields.get(key);
		if (isNode(value)) return [value];
		return Array.isArray(value) ? value.filter(isNode) : [];
	});
}
