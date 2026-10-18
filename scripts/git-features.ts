// Whether `git --attr-source=<tree>`, which reads .gitattributes from a tree
// instead of the working tree, is available. It arrived in Git 2.41.
export const supportsAttributeSource = (gitVersion: string) => {
  const [major = 0, minor = 0] = (/(\d+)\.(\d+)/.exec(gitVersion) ?? [])
    .slice(1)
    .map(Number)

  return major > 2 || (major === 2 && minor >= 41)
}
