import { cloudDb, Collections } from '../../utils/cloud-db';

interface ProjectWithCategory extends Project {
  categoryName: string;
}

interface GroupedProjects {
  categoryId: string;
  categoryName: string;
  projects: ProjectWithCategory[];
}

const app = getApp<IAppOption>();

Page({
  data: {
    projects: [] as ProjectWithCategory[],
    groupedProjects: [] as GroupedProjects[],
    loading: false,
    storeName: 'PADOO·趴岛'
  },

  async onLoad() {
    await this.loadProjects();
  },

  async loadProjects() {
    try {
      this.setData({ loading: true });

      const [projects, categories] = await Promise.all([
        app.getProjects(),
        cloudDb.getAll<ProjectCategory>(Collections.PROJECT_CATEGORIES)
      ]);

      const categoryMap = new Map<string, ProjectCategory>();
      categories.forEach(cat => {
        if (cat.status === 'normal') {
          categoryMap.set(cat._id, cat);
        }
      });

      const projectsWithCategory = projects
        .filter(p => p.status === 'normal')
        .map(p => ({
          ...p,
          categoryName: p.categoryId ? categoryMap.get(p.categoryId)?.name || '' : ''
        }))
        .sort((a, b) => {
          const categoryOrderA = categoryMap.get(a.categoryId)?.order || 0;
          const categoryOrderB = categoryMap.get(b.categoryId)?.order || 0;
          if (categoryOrderA !== categoryOrderB) {
            return categoryOrderA - categoryOrderB;
          }
          return (a.name || '').localeCompare(b.name || '');
        });

      const grouped: GroupedProjects[] = [];
      const categoryIds = [...new Set(projectsWithCategory.map(p => p.categoryId).filter(Boolean))];
      
      categoryIds.forEach(catId => {
        const category = categoryMap.get(catId);
        if (category) {
          grouped.push({
            categoryId: catId,
            categoryName: category.name,
            projects: projectsWithCategory.filter(p => p.categoryId === catId)
          });
        }
      });

      const uncategorized = projectsWithCategory.filter(p => !p.categoryId);
      if (uncategorized.length > 0) {
        grouped.push({
          categoryId: '',
          categoryName: '加钟',
          projects: uncategorized
        });
      }

      this.setData({
        projects: projectsWithCategory,
        groupedProjects: grouped,
        loading: false
      });
    } catch (error) {
      console.error('[ProjectList] loadProjects 失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  }
});
