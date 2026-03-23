import type { CharacterProfile, GameState } from '../../types/game';

/** Find the index of the Nth-to-last user message in a message array */
export const getStartIndexForRecentTurns = (messages: { role: string }[], turns: number) => {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      count++;
      if (count === turns) return i;
    }
  }
  return 0;
};

/** Get the most recent scene visuals description from chat history */
export function getLastSceneVisuals(state: GameState): string {
  return [...state.history].reverse().find(m => m.currentSceneVisuals)?.currentSceneVisuals || 'None yet';
}


// ── 角色设定字符串 ──
export function buildCharacterRoleString(profile: CharacterProfile): string {
  const cp = profile;
  return [
    `Name: ${cp.name}`, `Gender: ${cp.gender}`, `Age: ${cp.age}`,
    `Orientation: ${cp.orientation}`,
    `Appearance: Skin=${cp.skinColor}, Height=${cp.height}, Build=${cp.weight}, Hair=${cp.hairStyle} ${cp.hairColor}`,
    `PersonalityDesc: ${cp.personalityDesc}`,
    `Description: ${cp.description}`, `Personality: ${cp.personality}`,
    `Background: ${cp.background}`,
    `Specialties: ${cp.specialties}`, `Hobbies: ${cp.hobbies}`, `Dislikes: ${cp.dislikes}`,
  ].join('\n');
}