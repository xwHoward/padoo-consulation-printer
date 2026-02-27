import { cloudDb, Collections } from '../../utils/cloud-db';

Page({
	data: {
		loading: false,
		activeTab: 'projects',
		projects: [] as Project[],
		rooms: [] as Room[],
		essentialOils: [] as EssentialOil[],
		editingItem: null as Project | Room | EssentialOil | null,
		showModal: false,
		modalType: '',
		formData: {
			name: '',
			duration: 60,
			price: 0,
			commission: 0,
			effect: '',
			status: 'normal' as ItemStatus,
			isEssentialOilOnly: false,
			needEssentialOil: false
		}
	},

	onTabChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ activeTab: e.currentTarget.dataset.value });
		this.loadData();
	},

	async loadData() {
		try {
			this.setData({ loading: true });
			const tab = this.data.activeTab;

			if (tab === 'projects') {
				const projects = await cloudDb.getAll<Project>(Collections.PROJECTS);
				this.setData({ projects, loading: false });
			} else if (tab === 'rooms') {
				const rooms = await cloudDb.getAll<Room>(Collections.ROOMS);
				this.setData({ rooms, loading: false });
			} else if (tab === 'oils') {
				const oils = await cloudDb.getAll<EssentialOil>(Collections.ESSENTIAL_OILS);
				this.setData({ essentialOils: oils, loading: false });
			}
		} catch (error) {
			console.error('加载数据失败:', error);
			this.setData({ loading: false });
			wx.showToast({
				title: '加载失败',
				icon: 'none'
			});
		}
	},

	openAddModal(type: string) {
		this.setData({
			showModal: true,
			modalType: type,
			editingItem: null,
			formData: {
				name: '',
				duration: 60,
				price: 0,
				commission: 0,
				effect: '',
				status: 'normal',
				isEssentialOilOnly: false,
				needEssentialOil: false
			}
		});
	},

	openEditModal(e: WechatMiniprogram.CustomEvent) {
		const { type, index } = e.currentTarget.dataset;
		const tab = this.data.activeTab;
		let item: Project | Room | EssentialOil | null = null;

		if (tab === 'projects' && this.data.projects[index]) {
			item = this.data.projects[index];
		} else if (tab === 'rooms' && this.data.rooms[index]) {
			item = this.data.rooms[index];
		} else if (tab === 'oils' && this.data.essentialOils[index]) {
			item = this.data.essentialOils[index];
		}

		if (item) {
			this.setData({
				showModal: true,
				modalType: type,
				editingItem: item,
				formData: {
					name: item.name,
					duration: (item as Project).duration || 60,
					price: (item as Project).price || 0,
					commission: (item as Project).commission || 0,
					effect: (item as EssentialOil).effect || '',
					status: item.status || 'normal',
					isEssentialOilOnly: (item as Project).isEssentialOilOnly || false,
					needEssentialOil: (item as Project).needEssentialOil || false
				}
			});
		}
	},

	closeModal() {
		this.setData({ showModal: false });
	},

	onNameInput(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.name': e.detail.value });
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

	onStatusChange(e: WechatMiniprogram.CustomEvent) {
		this.setData({ 'formData.status': e.detail.value as ItemStatus });
	},

	onIsEssentialOilOnlyChange() {
		this.setData({ 'formData.isEssentialOilOnly': !this.data.formData.isEssentialOilOnly });
	},

	onNeedEssentialOilChange() {
		this.setData({ 'formData.needEssentialOil': !this.data.formData.needEssentialOil });
	},

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

			this.setData({ loading: true });
			if (activeTab === 'projects') {
				const projectData: Update<Project> = {
					name: formData.name,
					duration: formData.duration,
					price: formData.price,
					commission: formData.commission,
					status: formData.status,
					isEssentialOilOnly: formData.isEssentialOilOnly,
					needEssentialOil: formData.needEssentialOil
				};

				if (editingItem) {
					await cloudDb.updateById<Project>(Collections.PROJECTS, editingItem._id, projectData);
					wx.showToast({ title: '更新成功', icon: 'success' });
				} else {
					await cloudDb.insert<Project>(Collections.PROJECTS, projectData);
					wx.showToast({ title: '添加成功', icon: 'success' });
				}
			} else if (activeTab === 'rooms') {
				const roomData: Update<Room> = {
					name: formData.name,
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
			}
			this.setData({ loading: false });
			this.closeModal();
			await this.loadData();
		} catch (error) {
			console.error('保存失败:', error);
			wx.showToast({ title: '保存失败', icon: 'none' });
		}
	},

	async handleDelete(e: WechatMiniprogram.CustomEvent) {
		const { index } = e.currentTarget.dataset;
		const { activeTab } = this.data;
		let _id = '';
		let collectionName = '';

		if (activeTab === 'projects' && this.data.projects[index]) {
			_id = this.data.projects[index]._id;
			collectionName = Collections.PROJECTS;
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
						console.error('删除失败:', error);
						wx.showToast({ title: '删除失败', icon: 'none' });
					}
					this.setData({ loading: false });
				}
			}
		});
	},

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
			wx.showToast({ title: '更新失败', icon: 'none' });
		}
	},

	onAddProject() {
		this.openAddModal('project');
	},

	onAddRoom() {
		this.openAddModal('room');
	},

	onAddOil() {
		this.openAddModal('oil');
	},

	onLoad() {
		this.loadData();
	}
});
