import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface ProjectService {
  name: string;
  port: number;
  url: string;
}

export type ProjectStatus = 'active' | 'archived' | 'building';

export interface Project {
  id: string;
  name: string;
  description: string;
  created: string;
  status: ProjectStatus;
  tags: string[];
  git?: { remote: string };
  services?: ProjectService[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  tags?: string[];
  git?: { remote: string } | null;
  services?: ProjectService[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  tags?: string[];
  git?: { remote: string } | null;
  services?: ProjectService[];
}

const DEFAULT_PROJECTS_BASE = '/home/beniben/sona-workspace/independent/projects';

export class ProjectsService {
  constructor(private readonly basePath: string = DEFAULT_PROJECTS_BASE) {}

  getProjects(): Project[] {
    if (!fs.existsSync(this.basePath)) {
      return [];
    }

    const entries = fs.readdirSync(this.basePath, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = path.join(this.basePath, entry.name, 'project.json');
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as Project;
        // Back-fill status for project.json files that predate the status field
        if (!parsed.status) parsed.status = 'active';
        projects.push(parsed);
      } catch {
        // Skip malformed project.json files
      }
    }

    return projects.sort((a, b) => b.created.localeCompare(a.created));
  }

  getProject(id: string): Project | null {
    const jsonPath = path.join(this.basePath, id, 'project.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
      const raw = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(raw) as Project;
    } catch {
      return null;
    }
  }

  createProject(input: CreateProjectInput): Project {
    const id = randomUUID();
    const dirPath = path.join(this.basePath, id);
    fs.mkdirSync(dirPath, { recursive: true });

    const project: Project = {
      id,
      name: input.name,
      description: input.description ?? '',
      created: new Date().toISOString(),
      status: input.status ?? 'active',
      tags: input.tags ?? [],
      ...(input.git ? { git: input.git } : {}),
      ...(input.services ? { services: input.services } : {}),
    };

    fs.writeFileSync(path.join(dirPath, 'project.json'), JSON.stringify(project, null, 2));
    return project;
  }

  updateProject(id: string, input: UpdateProjectInput): Project | null {
    const jsonPath = path.join(this.basePath, id, 'project.json');
    if (!fs.existsSync(jsonPath)) return null;

    let existing: Project;
    try {
      existing = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Project;
    } catch {
      return null;
    }

    const updated: Project = {
      ...existing,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.git !== undefined ? (input.git === null ? { git: undefined } : { git: input.git }) : {}),
      ...(input.services !== undefined ? { services: input.services } : {}),
    };

    fs.writeFileSync(jsonPath, JSON.stringify(updated, null, 2));
    return updated;
  }

  deleteProject(id: string): boolean {
    const jsonPath = path.join(this.basePath, id, 'project.json');
    if (!fs.existsSync(jsonPath)) return false;
    fs.unlinkSync(jsonPath);
    return true;
  }
}

export const projectsService = new ProjectsService();
