import { cloudDb, Collections } from '../../utils/cloud-db';
import { buildI18nData, toggleLang as toggleLangFn, t } from '../../utils/i18n';

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
    t: buildI18nData('projectList'),
    projects: [] as ProjectWithCategory[],
    groupedProjects: [] as GroupedProjects[],
    loading: false,
    storeName: 'PADOO·趴岛'
  },

  async onLoad() {
    await this.loadProjects();
  },

  toggleLang() {
    toggleLangFn();
    this.setData({ t: buildI18nData('projectList') });
    this.loadProjects();
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
          categoryName: t('extraService'),
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
        title: t('loadFailed'),
        icon: 'error'
      });
    }
  }
});
