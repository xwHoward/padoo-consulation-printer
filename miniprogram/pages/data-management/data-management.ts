import { cloudDb, Collections } from '../../utils/cloud-db';

Page({
	data: {
		loading: false,
		activeTab: 'projects',
		projects: [] as Project[],
		projectsWithCategory: [] as Array<Project & { categoryName: string }>,
		projectCategories: [] as ProjectCategory[],
		rooms: [] as Room[],
		essentialOils: [] as EssentialOil[],
		prizes: [] as LotteryPrize[],
		editingItem: null as Project | ProjectCategory | Room | EssentialOil | LotteryPrize | null,
		showModal: false,
		modalType: '',
		formCategoryName: '',
		formData: {
			name: '',
			nameEn: '',
			subtitle: '',
			duration: 60,
			price: 0,
			commission: 0,
			effect: '',
			status: 'normal' as ItemStatus,
			isEssentialOilOnly: false,
			needEssentialOil: false,
			categoryId: '',
			serviceFlow: '',
			order: 0,
			type: 'product' as LotteryPrize['type'],
			value: 0,
			probability: 0,
			color: '#FF6B00',
			description: ''
		}
	},

	getDefaultFormData() {
		return {
			name: '',
			nameEn: '',
			subtitle: '',
			duration: 60,
			price: 0,
			commission: 0,
			effect: '',
			status: 'normal' as ItemStatus,
			isEssentialOilOnly: false,
			needEssentialOil: false,
			categoryId: '',
			serviceFlow: '',
			order: 0,
			type: 'product' as LotteryPrize['type'],
			value: 0,
			probability: 0,
			color: '#FF6B00',
			description: ''
		};
	},

	onTabChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ activeTab: e.currentTarget.dataset.value });
		this.loadData();
	},

	async loadData() {
		try {
			this.setData({ loading: true });
			const tab = this.data.activeTab;

			if (tab === 'projects' || tab === 'categories') {
				const [projects, projectCategories] = await Promise.all([
					cloudDb.getAll<Project>(Collections.PROJECTS),
					cloudDb.getAll<ProjectCategory>(Collections.PROJECT_CATEGORIES)
				]);
				const catMap = new Map<string, string>();
				for (const c of projectCategories) {
					catMap.set(c._id, c.name);
				}
				const projectsWithCategory = (projects || []).map(p => ({
					...p,
					categoryName: catMap.get(p.categoryId) || '未分类'
				}));
				this.setData({
					projects,
					projectsWithCategory,
					projectCategories,
					loading: false
				});
			} else if (tab === 'rooms') {
				const rooms = await cloudDb.getAll<Room>(Collections.ROOMS);
				this.setData({ rooms, loading: false });
			} else if (tab === 'oils') {
				const oils = await cloudDb.getAll<EssentialOil>(Collections.ESSENTIAL_OILS);
				this.setData({ essentialOils: oils, loading: false });
			} else if (tab === 'lottery') {
				const prizes = await cloudDb.getAll<LotteryPrize>(Collections.LOTTERY_PRIZES);
				this.setData({ prizes, loading: false });
			}
		} catch (error) {
			this.setData({ loading: false });
			wx.showToast({
				title: '加载失败',
				icon: 'none'
			});
		}
	},

	/** 分类名称查找 */
	getCategoryName(categoryId: string): string {
		const cat = this.data.projectCategories.find(c => c._id === categoryId);
		return cat ? cat.name : '未分类';
	},

	openAddModal(type: string) {
		this.setData({
			showModal: true,
			modalType: type,
			editingItem: null,
			formCategoryName: '',
			formData: this.getDefaultFormData()
		});
	},

	openEditModal(e: WechatMiniprogram.CustomEvent) {
		const { type, index } = e.currentTarget.dataset;
		const tab = this.data.activeTab;
		let item: Project | ProjectCategory | Room | EssentialOil | LotteryPrize | null = null;

		if (tab === 'projects' && this.data.projects[index]) {
			item = this.data.projects[index];
		} else if (tab === 'categories' && this.data.projectCategories[index]) {
			item = this.data.projectCategories[index];
		} else if (tab === 'rooms' && this.data.rooms[index]) {
			item = this.data.rooms[index];
		} else if (tab === 'oils' && this.data.essentialOils[index]) {
			item = this.data.essentialOils[index];
		} else if (tab === 'lottery' && this.data.prizes[index]) {
			item = this.data.prizes[index];
		}

		if (item) {
				const categoryId = (item as Project).categoryId || '';
				this.setData({
					showModal: true,
					modalType: type,
					editingItem: item,
					formCategoryName: this.getCategoryName(categoryId),
					formData: {
						name: item.name,
						nameEn: (item as Project).nameEn || (item as Room).nameEn || '',
						subtitle: (item as Project).subtitle || '',
						duration: (item as Project).duration || 60,
						price: (item as Project).price || 0,
						commission: (item as Project).commission || 0,
						effect: (item as EssentialOil).effect || '',
						status: item.status || 'normal',
						isEssentialOilOnly: (item as Project).isEssentialOilOnly || false,
						needEssentialOil: (item as Project).needEssentialOil || false,
						categoryId: (item as Project).categoryId || '',
						serviceFlow: (item as Project).serviceFlow || '',
						order: (item as ProjectCategory).order || 0,
						type: (item as LotteryPrize).type || 'product',
						value: (item as LotteryPrize).value || 0,
						probability: (item as LotteryPrize).probability || 0,
						color: (item as LotteryPrize).color || '#FF6B00',
						description: (item as LotteryPrize).description || ''
					}
				});
			}
	},

	closeModal() {
		this.setData({ showModal: false, formCategoryName: '' });
	},

	// ========================= 通用表单输入 =========================
	onNameInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.name': e.detail.value });
	},

	onNameEnInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.nameEn': e.detail.value });
	},

	onSubtitleInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.subtitle': e.detail.value });
	},

	onDurationInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.duration': parseInt(e.detail.value) || 60 });
	},

	onPriceInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.price': parseFloat(e.detail.value) || 0 });
	},

	onCommissionInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.commission': parseInt(e.detail.value) || 0 });
	},

	onEffectInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.effect': e.detail.value });
	},

	onOrderInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.order': parseInt(e.detail.value) || 0 });
	},

	onStatusChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.status': e.detail.value as ItemStatus });
	},

	onCategoryChange(e: WechatMiniprogram.CustomEvent) {
		const idx = parseInt(e.detail.value);
		const cat = this.data.projectCategories[idx];
		this.setData({
			'formData.categoryId': cat ? cat._id : '',
			formCategoryName: cat ? cat.name : ''
		});
	},

	onIsEssentialOilOnlyChange() {
		this.setData({ 'formData.isEssentialOilOnly': !this.data.formData.isEssentialOilOnly });
	},

	onNeedEssentialOilChange() {
		this.setData({ 'formData.needEssentialOil': !this.data.formData.needEssentialOil });
	},

	onServiceFlowInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.serviceFlow': e.detail.value });
	},

	// ========================= 保存 =========================
	async handleSave() {
		try {
			const { modalType, formData, editingItem, activeTab } = this.data;

			if (!formData.name.trim()) {
				wx.showToast({ title: '名称不能为空', icon: 'none' });
				return;
			}

			if (modalType === 'oils' && !formData.effect.trim()) {
				wx.showToast({ title: '功效不能为空', icon: 'none' });
				return;
			}

			if (modalType === 'project' && (!formData.commission || formData.commission <= 0)) {
				wx.showToast({ title: '手工提成必须为正整数', icon: 'none' });
				return;
			}

			if (modalType === 'prize') {
				if (formData.probability < 0 || formData.probability > 100) {
					wx.showToast({ title: '概率必须在0-100之间', icon: 'none' });
					return;
				}
				if (!formData.color.trim()) {
					wx.showToast({ title: '颜色不能为空', icon: 'none' });
					return;
				}
			}

			this.setData({ loading: true });

			if (activeTab === 'projects') {
				const projectData: Update<Project> = {
					name: formData.name,
					nameEn: formData.nameEn,
					subtitle: formData.subtitle,
					duration: formData.duration,
					price: formData.price,
					commission: formData.commission,
					status: formData.status,
					isEssentialOilOnly: formData.isEssentialOilOnly,
					needEssentialOil: formData.needEssentialOil,
					categoryId: formData.categoryId,
					serviceFlow: formData.serviceFlow
				};

				if (editingItem) {
					await cloudDb.updateById<Project>(Collections.PROJECTS, editingItem._id, projectData);
					wx.showToast({ title: '更新成功', icon: 'success' });
				} else {
					await cloudDb.insert<Project>(Collections.PROJECTS, projectData);
					wx.showToast({ title: '添加成功', icon: 'success' });
				}
			} else if (activeTab === 'categories') {
				const categoryData: Update<ProjectCategory> = {
					name: formData.name,
					order: formData.order,
					status: formData.status
				};

				if (editingItem) {
					await cloudDb.updateById<ProjectCategory>(Collections.PROJECT_CATEGORIES, editingItem._id, categoryData);
					wx.showToast({ title: '更新成功', icon: 'success' });
				} else {
					await cloudDb.insert<ProjectCategory>(Collections.PROJECT_CATEGORIES, categoryData);
					wx.showToast({ title: '添加成功', icon: 'success' });
				}
			} else if (activeTab === 'rooms') {
				const roomData: Update<Room> = {
					name: formData.name,
					nameEn: formData.nameEn,
					status: formData.status
				};

				if (editingItem) {
					await cloudDb.updateById<Room>(Collections.ROOMS, editingItem._id, roomData);
					wx.showToast({ title: '更新成功', icon: 'success' });
				} else {
					await cloudDb.insert<Room>(Collections.ROOMS, roomData);
					wx.showToast({ title: '添加成功', icon: 'success' });
				}
			} else if (activeTab === 'oils') {
				const oilData: Update<EssentialOil> = {
					name: formData.name,
					effect: formData.effect,
					status: formData.status
				};

				if (editingItem) {
					await cloudDb.updateById<EssentialOil>(Collections.ESSENTIAL_OILS, editingItem._id, oilData);
					wx.showToast({ title: '更新成功', icon: 'success' });
				} else {
					await cloudDb.insert<EssentialOil>(Collections.ESSENTIAL_OILS, oilData);
					wx.showToast({ title: '添加成功', icon: 'success' });
				}
			} else if (activeTab === 'lottery') {
				const prizeData: Add<LotteryPrize> = {
					name: formData.name,
					type: formData.type,
					value: formData.value,
					probability: formData.probability,
					color: formData.color,
					description: formData.description,
					status: formData.status
				};

				if (editingItem) {
					await cloudDb.updateById<LotteryPrize>(Collections.LOTTERY_PRIZES, editingItem._id, prizeData);
					wx.showToast({ title: '更新成功', icon: 'success' });
				} else {
					await cloudDb.insert<LotteryPrize>(Collections.LOTTERY_PRIZES, prizeData);
					wx.showToast({ title: '添加成功', icon: 'success' });
				}
			}
			this.setData({ loading: false });
			this.closeModal();
			await this.loadData();
		} catch (error) {
			this.setData({ loading: false });
			wx.showToast({ title: '保存失败', icon: 'none' });
		}
	},

	// ========================= 删除 =========================
	async handleDelete(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { activeTab } = this.data;
		let _id = '';
		let collectionName = '';

		if (activeTab === 'projects' && this.data.projects[index]) {
			_id = this.data.projects[index]._id;
			collectionName = Collections.PROJECTS;
		} else if (activeTab === 'categories' && this.data.projectCategories[index]) {
			_id = this.data.projectCategories[index]._id;
			collectionName = Collections.PROJECT_CATEGORIES;
		} else if (activeTab === 'rooms' && this.data.rooms[index]) {
			_id = this.data.rooms[index]._id;
			collectionName = Collections.ROOMS;
		} else if (activeTab === 'oils' && this.data.essentialOils[index]) {
			_id = this.data.essentialOils[index]._id;
			collectionName = Collections.ESSENTIAL_OILS;
		}

		if (!_id) return;

		wx.showModal({
			title: '确认删除',
			content: '确定要删除此项目吗？',
			confirmText: '删除',
			confirmColor: '#ff0000',
			success: async (res) => {
				if (res.confirm) {
					this.setData({ loading: true });
					try {
						await cloudDb.deleteById(collectionName, _id);
						wx.showToast({ title: '删除成功', icon: 'success' });
						await this.loadData();
					} catch (error) {
						wx.showToast({ title: '删除失败', icon: 'none' });
					}
					this.setData({ loading: false });
				}
			}
		});
	},

	// ========================= 状态切换 =========================
	async handleToggleStatus(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { activeTab } = this.data;

		try {
			this.setData({ loading: true });
			if (activeTab === 'projects' && this.data.projects[index]) {
				const item = this.data.projects[index];
				const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
				await cloudDb.updateById<Project>(Collections.PROJECTS, item._id, { status: newStatus });
				this.setData({ [`projects[${index}].status`]: newStatus });
			} else if (activeTab === 'categories' && this.data.projectCategories[index]) {
				const item = this.data.projectCategories[index];
				const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
				await cloudDb.updateById<ProjectCategory>(Collections.PROJECT_CATEGORIES, item._id, { status: newStatus });
				this.setData({ [`projectCategories[${index}].status`]: newStatus });
			} else if (activeTab === 'rooms' && this.data.rooms[index]) {
				const item = this.data.rooms[index];
				const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
				await cloudDb.updateById<Room>(Collections.ROOMS, item._id, { status: newStatus });
				this.setData({ [`rooms[${index}].status`]: newStatus });
			} else if (activeTab === 'oils' && this.data.essentialOils[index]) {
				const item = this.data.essentialOils[index];
				const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
				await cloudDb.updateById<EssentialOil>(Collections.ESSENTIAL_OILS, item._id, { status: newStatus });
				this.setData({ [`essentialOils[${index}].status`]: newStatus });
			}
			this.setData({ loading: false });
		} catch (error) {
			this.setData({ loading: false });
			wx.showToast({ title: '更新失败', icon: 'none' });
		}
	},

	// ========================= 添加按钮 =========================
	onAddProject() {
		this.openAddModal('project');
	},

	onAddCategory() {
		this.openAddModal('category');
	},

	onAddRoom() {
		this.openAddModal('room');
	},

	onAddOil() {
		this.openAddModal('oil');
	},

	onAddPrize() {
		this.setData({
			showModal: true,
			modalType: 'prize',
			editingItem: null,
			formData: this.getDefaultFormData()
		});
	},

	// ========================= 奖品独立方法 =========================
	async handleDeletePrize(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const prize = this.data.prizes[index];

		if (!prize || !prize._id) return;

		wx.showModal({
			title: '确认删除',
			content: '确定要删除此奖品吗？',
			confirmText: '删除',
			confirmColor: '#ff0000',
			success: async (res) => {
				if (res.confirm) {
					this.setData({ loading: true });
					try {
						await cloudDb.deleteById(Collections.LOTTERY_PRIZES, prize._id);
						wx.showToast({ title: '删除成功', icon: 'success' });
						await this.loadData();
					} catch (error) {
						wx.showToast({ title: '删除失败', icon: 'none' });
					}
					this.setData({ loading: false });
				}
			}
		});
	},

	async handleTogglePrizeStatus(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const prize = this.data.prizes[index];

		if (!prize || !prize._id) return;

		try {
			this.setData({ loading: true });
			const newStatus = prize.status === 'normal' ? 'disabled' : 'normal';
			await cloudDb.updateById<LotteryPrize>(Collections.LOTTERY_PRIZES, prize._id, { status: newStatus });
			this.setData({ [`prizes[${index}].status`]: newStatus, loading: false });
		} catch (error) {
			this.setData({ loading: false });
			wx.showToast({ title: '更新失败', icon: 'none' });
		}
	},

	onPrizeTypeChange(e: WechatMiniprogram.CustomEvent) {
		const value = e.currentTarget.dataset.value as LotteryPrize['type'];
		this.setData({ 'formData.type': value });
	},

	onPrizeValueInput(e: WechatMiniprogram.CustomEvent) {
		const value = parseFloat(e.detail.value) || 0;
		this.setData({ 'formData.value': value });
	},

	onPrizeProbabilityInput(e: WechatMiniprogram.CustomEvent) {
		const value = parseFloat(e.detail.value) || 0;
		this.setData({ 'formData.probability': value });
	},

	onPrizeColorInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.color': e.detail.value });
	},

	onPrizeDescriptionInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.description': e.detail.value });
	},

	onLoad() {
		this.loadData();
	}
});
