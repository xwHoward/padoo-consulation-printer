import {cloudDb} from '../../utils/cloud-db';
import {Collections} from '../../utils/db';

Component({
	data: {
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
			effect: '',
			status: 'normal' as ItemStatus,
			isEssentialOilOnly: false
		}
	},

	methods: {
		getDb() {
			return cloudDb;
		},

		onTabChange(e: any) {
			this.setData({activeTab: e.currentTarget.dataset.value});
			this.loadData();
		},

		async loadData() {
			try {
				const database = this.getDb();
				const tab = this.data.activeTab;

				if (tab === 'projects') {
					const projects = await database.getAll<Project>(Collections.PROJECTS);
					this.setData({projects});
				} else if (tab === 'rooms') {
					const rooms = await database.getAll<Room>(Collections.ROOMS);
					this.setData({rooms});
				} else if (tab === 'oils') {
					const oils = await database.getAll<EssentialOil>(Collections.ESSENTIAL_OILS);
					this.setData({essentialOils: oils});
				}
			} catch (error) {
				console.error('加载数据失败:', error);
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
					effect: '',
					status: 'normal',
					isEssentialOilOnly: false
				}
			});
		},

		openEditModal(e: any) {
			const {type, index} = e.currentTarget.dataset;
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
						effect: (item as EssentialOil).effect || '',
						status: item.status || 'normal',
						isEssentialOilOnly: (item as Project).isEssentialOilOnly || false
					}
				});
			}
		},

		closeModal() {
			this.setData({showModal: false});
		},

		onNameInput(e: any) {
			this.setData({'formData.name': e.detail.value});
		},

		onDurationInput(e: any) {
			this.setData({'formData.duration': parseInt(e.detail.value) || 60});
		},

		onPriceInput(e: any) {
			this.setData({'formData.price': parseFloat(e.detail.value) || 0});
		},

		onEffectInput(e: any) {
			this.setData({'formData.effect': e.detail.value});
		},

		onStatusChange(e: any) {
			this.setData({'formData.status': e.detail.value as ItemStatus});
		},

		onIsEssentialOilOnlyChange(e: any) {
			this.setData({'formData.isEssentialOilOnly': e.detail.checked});
		},

		async handleSave() {
			try {
				const database = this.getDb();
				const {modalType, formData, editingItem, activeTab} = this.data;

				if (!formData.name.trim()) {
					wx.showToast({title: '名称不能为空', icon: 'none'});
					return;
				}

				if (modalType === 'oils' && !formData.effect.trim()) {
					wx.showToast({title: '功效不能为空', icon: 'none'});
					return;
				}

				if (activeTab === 'projects') {
					const projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
						name: formData.name,
						duration: formData.duration,
						price: formData.price,
						status: formData.status,
						isEssentialOilOnly: formData.isEssentialOilOnly
					};

					if (editingItem) {
						await database.updateById<Project>(Collections.PROJECTS, editingItem.id, projectData);
						wx.showToast({title: '更新成功', icon: 'success'});
					} else {
						await database.insert<Project>(Collections.PROJECTS, projectData);
						wx.showToast({title: '添加成功', icon: 'success'});
					}
				} else if (activeTab === 'rooms') {
					const roomData: Omit<Room, 'id' | 'createdAt' | 'updatedAt'> = {
						name: formData.name,
						status: formData.status
					};

					if (editingItem) {
						await database.updateById<Room>(Collections.ROOMS, editingItem.id, roomData);
						wx.showToast({title: '更新成功', icon: 'success'});
					} else {
						await database.insert<Room>(Collections.ROOMS, roomData);
						wx.showToast({title: '添加成功', icon: 'success'});
					}
				} else if (activeTab === 'oils') {
					const oilData: Omit<EssentialOil, 'id' | 'createdAt' | 'updatedAt'> = {
						name: formData.name,
						effect: formData.effect,
						status: formData.status
					};

					if (editingItem) {
						await database.updateById<EssentialOil>(Collections.ESSENTIAL_OILS, editingItem.id, oilData);
						wx.showToast({title: '更新成功', icon: 'success'});
					} else {
						await database.insert<EssentialOil>(Collections.ESSENTIAL_OILS, oilData);
						wx.showToast({title: '添加成功', icon: 'success'});
					}
				}

				this.closeModal();
				await this.loadData();
			} catch (error) {
				console.error('保存失败:', error);
				wx.showToast({title: '保存失败', icon: 'none'});
			}
		},

		async handleDelete(e: any) {
			const {index} = e.currentTarget.dataset;
			const {activeTab} = this.data;
			let id = '';
			let collectionName = '';

			if (activeTab === 'projects' && this.data.projects[index]) {
				id = this.data.projects[index].id;
				collectionName = Collections.PROJECTS;
			} else if (activeTab === 'rooms' && this.data.rooms[index]) {
				id = this.data.rooms[index].id;
				collectionName = Collections.ROOMS;
			} else if (activeTab === 'oils' && this.data.essentialOils[index]) {
				id = this.data.essentialOils[index].id;
				collectionName = Collections.ESSENTIAL_OILS;
			}

			if (!id) return;

			wx.showModal({
				title: '确认删除',
				content: '确定要删除此项目吗？',
				confirmText: '删除',
				confirmColor: '#ff0000',
				success: async (res) => {
					if (res.confirm) {
						try {
							const database = this.getDb();
							await database.deleteById(collectionName, id);
							wx.showToast({title: '删除成功', icon: 'success'});
							await this.loadData();
						} catch (error) {
							console.error('删除失败:', error);
							wx.showToast({title: '删除失败', icon: 'none'});
						}
					}
				}
			});
		},

		async handleToggleStatus(e: any) {
			const {index} = e.currentTarget.dataset;
			const {activeTab} = this.data;

			try {
				const database = this.getDb();

				if (activeTab === 'projects' && this.data.projects[index]) {
					const item = this.data.projects[index];
					const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
					await database.updateById<Project>(Collections.PROJECTS, item.id, {status: newStatus});
					this.setData({[`projects[${index}].status`]: newStatus});
				} else if (activeTab === 'rooms' && this.data.rooms[index]) {
					const item = this.data.rooms[index];
					const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
					await database.updateById<Room>(Collections.ROOMS, item.id, {status: newStatus});
					this.setData({[`rooms[${index}].status`]: newStatus});
				} else if (activeTab === 'oils' && this.data.essentialOils[index]) {
					const item = this.data.essentialOils[index];
					const newStatus = item.status === 'normal' ? 'disabled' : 'normal';
					await database.updateById<EssentialOil>(Collections.ESSENTIAL_OILS, item.id, {status: newStatus});
					this.setData({[`essentialOils[${index}].status`]: newStatus});
				}
			} catch (error) {
				console.error('更新状态失败:', error);
				wx.showToast({title: '更新失败', icon: 'none'});
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
		}
	},

	lifetimes: {
		attached() {
			this.loadData();
		}
	}
});
