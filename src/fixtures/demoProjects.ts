import type { Project } from '../domain/types';
import { art } from './demoSkills.ts';
export const projects: Project[] = [
  { id: 'spring-flowers', name: '春日花影海报', image: art('recent-flowers'), date: '2026-10-02 14:20', skillId: 'paper-signal' },
  { id: 'sunset-sea', name: '海边日落风景图', image: art('recent-sea'), date: '2026-10-01 19:03', skillId: 'watercolor-portrait' },
];
