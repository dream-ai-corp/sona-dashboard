import { LifeArea } from '@plm/shared';
import { CreateRoutineInput } from './routines.validator';

/**
 * Built-in routine presets. Each entry is a ready-to-instantiate
 * `CreateRoutineInput`. The user picks one in the UI and a real Routine is
 * created in their account — the preset itself is just a template.
 */

export interface RoutinePreset {
  id: string;
  name: string;
  description: string;
  source: string;
  routine: CreateRoutineInput;
}

export const presets: RoutinePreset[] = [
  {
    id: 'miracle-morning-savers',
    name: 'Miracle Morning — SAVERS',
    description:
      'The six-phase morning routine from Hal Elrod\'s book. 60 minutes total, 10 minutes per phase: '
      + 'Silence, Affirmations, Visualization, Exercise, Reading, Scribing.',
    source: 'Hal Elrod — The Miracle Morning',
    routine: {
      title: 'Miracle Morning (SAVERS)',
      description: '60-minute morning routine: 10 minutes of Silence, Affirmations, Visualization, Exercise, Reading, Scribing.',
      lifeArea: LifeArea.DEVELOPPEMENT_PERSONNEL,
      timeOfDay: '06:00',
      alarmEnabled: true,
      steps: [
        {
          title: 'Silence (meditation)',
          kind: 'SILENCE',
          durationMinutes: 10,
          mediaUrl: null,
          mediaKind: 'VIDEO',
          mediaAutoplay: true,
          notes: 'Guided meditation. Attach your preferred YouTube meditation video in the media URL — it will auto-play when the step begins.',
        },
        {
          title: 'Affirmations',
          kind: 'AFFIRMATIONS',
          durationMinutes: 10,
          mediaUrl: null,
          mediaKind: 'DOCUMENT',
          mediaAutoplay: false,
          notes: 'Read your affirmations out loud. Link a Google Doc / Notion / plain URL in the media URL and it opens in a new tab.',
        },
        {
          title: 'Visualization',
          kind: 'VISUALIZATION',
          durationMinutes: 10,
          mediaUrl: null,
          mediaKind: 'VIDEO',
          mediaAutoplay: false,
          notes: 'Close your eyes, visualize the day and your long-term goals. Optional guided-visualization video.',
        },
        {
          title: 'Exercise',
          kind: 'EXERCISE',
          durationMinutes: 10,
          mediaUrl: null,
          mediaKind: 'AUDIO',
          mediaAutoplay: true,
          notes: 'Body movement — stretching, yoga, HIIT. Attach a workout playlist or motivation music in the media URL.',
        },
        {
          title: 'Reading',
          kind: 'READING',
          durationMinutes: 10,
          mediaUrl: null,
          mediaKind: 'DOCUMENT',
          mediaAutoplay: false,
          notes: '10 pages of a personal-development book. Link the PDF / ebook URL here so you open it in one tap.',
        },
        {
          title: 'Scribing (journaling)',
          kind: 'SCRIBING',
          durationMinutes: 10,
          mediaUrl: null,
          mediaKind: 'DOCUMENT',
          mediaAutoplay: false,
          notes: 'Write in your journal. Gratitude, lessons, plans. Link your journaling app or a blank Google Doc.',
        },
      ],
    },
  },
];

export function findPreset(id: string): RoutinePreset | undefined {
  return presets.find((p) => p.id === id);
}
