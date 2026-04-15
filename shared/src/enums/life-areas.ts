export enum LifeArea {
  SANTE = 'SANTE',
  AMOUR_ET_COUPLE = 'AMOUR_ET_COUPLE',
  CARRIERE = 'CARRIERE',
  FINANCES = 'FINANCES',
  LOISIRS = 'LOISIRS',
  DEVELOPPEMENT_PERSONNEL = 'DEVELOPPEMENT_PERSONNEL',
  FAMILLE_ET_AMIS = 'FAMILLE_ET_AMIS',
  ENVIRONNEMENT = 'ENVIRONNEMENT',
  ORGANISATION = 'ORGANISATION',
  ADMINISTRATIF = 'ADMINISTRATIF',
}

export const LIFE_AREA_LABELS: Record<LifeArea, string> = {
  [LifeArea.SANTE]: 'Santé',
  [LifeArea.AMOUR_ET_COUPLE]: 'Amour et Couple',
  [LifeArea.CARRIERE]: 'Carrière',
  [LifeArea.FINANCES]: 'Finances',
  [LifeArea.LOISIRS]: 'Loisirs',
  [LifeArea.DEVELOPPEMENT_PERSONNEL]: 'Développement Personnel',
  [LifeArea.FAMILLE_ET_AMIS]: 'Famille et Amis',
  [LifeArea.ENVIRONNEMENT]: 'Environnement',
  [LifeArea.ORGANISATION]: 'Organisation',
  [LifeArea.ADMINISTRATIF]: 'Administratif',
};

export const LIFE_AREA_COLORS: Record<LifeArea, string> = {
  [LifeArea.SANTE]: '#EF4444',
  [LifeArea.AMOUR_ET_COUPLE]: '#EC4899',
  [LifeArea.CARRIERE]: '#F59E0B',
  [LifeArea.FINANCES]: '#10B981',
  [LifeArea.LOISIRS]: '#8B5CF6',
  [LifeArea.DEVELOPPEMENT_PERSONNEL]: '#3B82F6',
  [LifeArea.FAMILLE_ET_AMIS]: '#F97316',
  [LifeArea.ENVIRONNEMENT]: '#14B8A6',
  [LifeArea.ORGANISATION]: '#6366F1',
  [LifeArea.ADMINISTRATIF]: '#64748B',
};

export const LIFE_AREAS = Object.values(LifeArea);
