import * as fs from 'fs';
import * as path from 'path';
import { ProjectsService } from '../projects.service';

jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ProjectsService', () => {
  const basePath = '/fake/projects';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should return empty array when base path does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const service = new ProjectsService(basePath);
      const result = service.getProjects();

      expect(result).toEqual([]);
    });

    it('should return parsed project data from project.json files', () => {
      const mockProject = {
        id: 'ai-tv-studio',
        name: 'AI TV Studio',
        description: 'Automated TV show generator',
        created: '2026-04-14T00:00:00Z',
        tags: ['ai', 'video'],
        git: { remote: 'https://github.com/dream-ai-corp/ai-tv-studio' },
        services: [{ name: 'backend', port: 8020, url: 'http://localhost:8020' }],
      };

      mockedFs.existsSync.mockImplementation((p) => {
        if (p === basePath) return true;
        if (p === path.join(basePath, 'ai-tv-studio', 'project.json')) return true;
        return false;
      });

      mockedFs.readdirSync.mockReturnValue([
        { name: 'ai-tv-studio', isDirectory: () => true },
      ] as any);

      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockProject));

      const service = new ProjectsService(basePath);
      const result = service.getProjects();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('ai-tv-studio');
      expect(result[0]!.name).toBe('AI TV Studio');
      expect(result[0]!.tags).toContain('ai');
    });

    it('should skip entries that are not directories', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'some-file.txt', isDirectory: () => false },
      ] as any);

      const service = new ProjectsService(basePath);
      const result = service.getProjects();

      expect(result).toHaveLength(0);
    });

    it('should skip directories without project.json', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        if (p === basePath) return true;
        // project.json does not exist
        return false;
      });

      mockedFs.readdirSync.mockReturnValue([
        { name: 'empty-project', isDirectory: () => true },
      ] as any);

      const service = new ProjectsService(basePath);
      const result = service.getProjects();

      expect(result).toHaveLength(0);
    });

    it('should skip malformed project.json files', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'bad-project', isDirectory: () => true },
      ] as any);
      mockedFs.readFileSync.mockReturnValue('not valid json {{{');

      const service = new ProjectsService(basePath);
      const result = service.getProjects();

      expect(result).toHaveLength(0);
    });

    it('should sort projects by created date descending', () => {
      const older = { id: 'old', name: 'Old', description: '', created: '2025-01-01T00:00:00Z', tags: [] };
      const newer = { id: 'new', name: 'New', description: '', created: '2026-04-14T00:00:00Z', tags: [] };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        { name: 'old', isDirectory: () => true },
        { name: 'new', isDirectory: () => true },
      ] as any);

      mockedFs.readFileSync
        .mockReturnValueOnce(JSON.stringify(older))
        .mockReturnValueOnce(JSON.stringify(newer));

      const service = new ProjectsService(basePath);
      const result = service.getProjects();

      expect(result[0]!.id).toBe('new');
      expect(result[1]!.id).toBe('old');
    });
  });
});
