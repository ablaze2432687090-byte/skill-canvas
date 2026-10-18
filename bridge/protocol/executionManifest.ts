import type { SkillManifest } from '../../src/domain/skill';

// Repository artwork is presentation data, not a generation input. Keep provenance
// in the frozen manifest without copying megabytes into every streamed task snapshot.
export function executionManifest(manifest: SkillManifest): SkillManifest {
  return { ...manifest, examples: manifest.examples.map(example => ({ ...example,
    imageRef: example.imageRef?.startsWith('data:image/') ? example.sha256 ? `asset:skill-example:${example.sha256}` : null : example.imageRef,
    beforeRef: example.beforeRef?.startsWith('data:image/') ? null : example.beforeRef,
  })) };
}

export function declaredExampleAssets(manifest?: SkillManifest): Record<string, string> {
  return Object.fromEntries((manifest?.examples || []).flatMap(example => example.sha256 && example.imageRef?.startsWith('data:image/') ? [[`asset:skill-example:${example.sha256}`, example.imageRef]] : []));
}
