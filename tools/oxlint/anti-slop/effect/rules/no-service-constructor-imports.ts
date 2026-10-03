import { defineRule } from "vite-plus/lint/plugins";

import type { ESTree } from "vite-plus/lint/plugins";

const SERVICE_CONSTRUCTOR_NAME = /^make[A-Z]/u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function isProjectLocalImport(source: string): boolean {
	return source.startsWith("./") || source.startsWith("../") || source.startsWith("@/");
}

function getImportedName(specifier: ESTree.ImportSpecifier): string {
	if (specifier.imported.type === "Identifier") return specifier.imported.name;
	return specifier.imported.value;
}

/** A statically known property name: `x.name`, `x["name"]` or `{ name }` / `{ "name": … }`. */
function staticPropertyName(key: ESTree.Node, computed: boolean): string | undefined {
	if (!computed && key.type === "Identifier") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;
	return undefined;
}

/** Members read from a namespace binding by name: `Ns.make`, `Ns["make"]` or `const { make } = Ns`. */
function namespaceMembers(identifier: ESTree.Node): Array<{ node: ESTree.Node; name: string }> {
	const parent = identifier.parent;
	if (parent?.type === "MemberExpression" && parent.object === identifier) {
		const name = staticPropertyName(parent.property, parent.computed);
		return name === undefined ? [] : [{ node: parent, name }];
	}
	if (parent?.type === "VariableDeclarator" && parent.init === identifier && parent.id.type === "ObjectPattern") {
		return parent.id.properties.flatMap((property) => {
			if (property.type !== "Property") return [];
			const name = staticPropertyName(property.key, property.computed);
			return name === undefined ? [] : [{ node: property, name }];
		});
	}
	return [];
}

/** Keep dependency-bearing Effect service constructors local to their owning capability modules. */
export const noServiceConstructorImportsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow project-local make<CapabilityName> imports outside test and spec files.",
		},
		messages: {
			serviceConstructorImport:
				'Do not import Effect service constructor "{{name}}" into runtime code. Import the owning Layer, yield the contextual service, and allow its requirements to propagate to the composition root.',
		},
	},
	create(context) {
		const isTestFile = TEST_FILE.test(context.filename.replaceAll("\\", "/"));

		return {
			ImportDeclaration(node) {
				// Type-only imports are erased, so they carry no runtime service dependency.
				if (isTestFile || node.importKind === "type" || !isProjectLocalImport(node.source.value)) return;

				for (const specifier of node.specifiers) {
					if (specifier.type === "ImportNamespaceSpecifier") {
						for (const variable of context.sourceCode.getDeclaredVariables(specifier)) {
							for (const reference of variable.references) {
								for (const { node: member, name } of namespaceMembers(reference.identifier)) {
									if (!SERVICE_CONSTRUCTOR_NAME.test(name)) continue;

									context.report({
										node: member,
										messageId: "serviceConstructorImport",
										data: { name },
									});
								}
							}
						}
						continue;
					}

					if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;

					const importedName = getImportedName(specifier);
					if (!SERVICE_CONSTRUCTOR_NAME.test(importedName)) continue;

					context.report({
						node: specifier,
						messageId: "serviceConstructorImport",
						data: { name: importedName },
					});
				}
			},
		};
	},
});
