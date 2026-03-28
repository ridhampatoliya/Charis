const REQUIRED_ROOT_FIELDS = [
  'name',
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'alignmentSummary',
  'alignmentGaps',
  'totalWords',
  'changes',
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function ensureExperience(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'experience must be a non-empty array.';
  }
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object') {
      return `experience[${index}] must be an object.`;
    }
    if (!isNonEmptyString(entry.company)) return `experience[${index}].company is required.`;
    if (!isNonEmptyString(entry.title)) return `experience[${index}].title is required.`;
    if (!isNonEmptyString(entry.dates)) return `experience[${index}].dates is required.`;
    if (!Array.isArray(entry.bullets) || entry.bullets.length === 0) {
      return `experience[${index}].bullets must be a non-empty array.`;
    }
  }
  return null;
}

function ensureEducation(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return 'education must be a non-empty array.';
  }
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object') {
      return `education[${index}] must be an object.`;
    }
    if (!isNonEmptyString(entry.school)) return `education[${index}].school is required.`;
    if (!isNonEmptyString(entry.degree)) return `education[${index}].degree is required.`;
  }
  return null;
}

function ensureSkills(skills) {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
    return 'skills must be an object keyed by category.';
  }
  if (!Object.keys(skills).length) {
    return 'skills must contain at least one category.';
  }
  return null;
}

export function validateResumeData(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Resume data must be an object.' };
  }

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in data)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  if (!isNonEmptyString(data.summary)) {
    return { valid: false, error: 'summary must be a non-empty string.' };
  }

  const experienceError = ensureExperience(data.experience);
  if (experienceError) return { valid: false, error: experienceError };

  const educationError = ensureEducation(data.education);
  if (educationError) return { valid: false, error: educationError };

  const skillsError = ensureSkills(data.skills);
  if (skillsError) return { valid: false, error: skillsError };

  if (!Array.isArray(data.alignmentGaps)) {
    return { valid: false, error: 'alignmentGaps must be an array.' };
  }

  if (typeof data.totalWords !== 'number' || Number.isNaN(data.totalWords)) {
    return { valid: false, error: 'totalWords must be a number.' };
  }

  return { valid: true, data };
}

function countWords(value) {
  if (!value) return 0;
  if (typeof value === 'string') {
    return value.trim().split(/\s+/).filter(Boolean).length;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countWords(item), 0);
  }
  if (typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + countWords(item), 0);
  }
  return 0;
}

export function countResumeWords(resume) {
  return countWords(resume);
}
