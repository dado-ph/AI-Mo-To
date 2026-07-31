# AI-Mo-To Foundry guide

The Foundry is the reasoning and engineering guide supplied to a coding agent
when AI-Mo-To asks it to create an application. It is not a catalogue of
complete products: requests may require novel source code, algorithms, data
models, and interactions.

The guide is supplied with the user request and an isolated generated-app
repository. The agent may create novel code there while following the default
stack, UX principles, capability rules, and verification requirements.
AI-Mo-To owns repository allocation, validation, proposal digests, approval,
and installation; the agent never edits the AI-Mo-To product repository.

The workspace itself is also usually generated around the person's need. It is
not required to contain a permanent Files-and-Tasks shell or to share one
application layout with every other workspace. The Foundry supplies the common
substrate—authority and capability visibility, provenance, health, recovery,
and a dependable route to the installed application—while the agent determines
the useful home view, navigation, data surfaces, and interactions for that
workspace. Similarity should come from shared quality and trust principles,
not from forcing unrelated products into the same dashboard.

The canonical programmatic context is exported by `@ai-mo-to/foundry` as
`FOUNDRY_GUIDE` and `createFoundryContext`.
