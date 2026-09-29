// Shared by the server (authoritative check) and the browser (live meter, lazy-loaded).
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEn from "@zxcvbn-ts/language-en";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
/** zxcvbn score 3 = "safely unguessable: moderate protection from offline slow-hash attacks". */
export const PASSWORD_MIN_SCORE = 3;

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  isStrong: boolean;
  problems: string[];
};

let zxcvbn: ZxcvbnFactory | undefined;

function getZxcvbn(): ZxcvbnFactory {
  zxcvbn ??= new ZxcvbnFactory({
    translations: zxcvbnEn.translations,
    graphs: zxcvbnCommon.adjacencyGraphs,
    dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEn.dictionary },
  });
  return zxcvbn;
}

/** "Priya Sharma" → priya sharma, priya, sharma, priyasharma (zxcvbn only matches whole entries). */
function expandUserInputs(userInputs: string[]): string[] {
  const words = new Set<string>();
  for (const input of userInputs) {
    const value = input.trim().toLowerCase();
    if (!value) continue;
    const localPart = value.split("@")[0];
    for (const candidate of [
      value,
      localPart,
      value.replace(/[^\p{L}\p{N}]/gu, ""),
      localPart.replace(/[^\p{L}\p{N}]/gu, ""),
      ...value.split(/[^\p{L}\p{N}]+/u),
    ]) {
      if (candidate.length >= 2) words.add(candidate);
    }
  }
  return [...words];
}

/** `userInputs` (name, email...) are treated as easy-to-guess words. */
export function checkPasswordStrength(
  password: string,
  userInputs: string[] = [],
): PasswordStrength {
  const problems: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  const result = getZxcvbn().check(
    password.slice(0, PASSWORD_MAX_LENGTH),
    expandUserInputs(userInputs),
  );

  if (result.score < PASSWORD_MIN_SCORE) {
    if (result.feedback.warning) problems.push(result.feedback.warning);
    problems.push(...result.feedback.suggestions);
    if (!result.feedback.warning && result.feedback.suggestions.length === 0) {
      problems.push("This password is too easy to guess.");
    }
  }

  return {
    score: result.score,
    isStrong: problems.length === 0,
    problems: [...new Set(problems)],
  };
}
