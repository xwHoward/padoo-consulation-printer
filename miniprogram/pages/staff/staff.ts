// staff.ts
import {db, Collections, generateId, getTimestamp} from '../../utils/db';

Component({
	data: {
		staffList: [] as StaffInfo[],
		showModal: false,
		editingStaff: null as StaffInfo | null,
		inputName: '',
		inputStatus: 'active' as StaffStatus,
	},

	lifetimes: {
		attached() {
			this.loadStaffList();
		},
	},

	pageLifetimes: {
		show() {
			this.loadStaffList();
		},
	},

	methods: {
		// 加载员工列表
		loadStaffList() {
			const staffList = db.getAll<StaffInfo>(Collections.STAFF);
			// 按创建时间倒序排列
			staffList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
			this.setData({staffList});
		},

		// 添加员工
		onAddStaff() {
			this.setData({
				showModal: true,
				editingStaff: null,
				inputName: '',
				inputStatus: 'active',
			});
		},

		// 编辑员工
		onEditStaff(e: WechatMiniprogram.TouchEvent) {
			const id = e.currentTarget.dataset.id as string;
			const staff = db.findById<StaffInfo>(Collections.STAFF, id);

			if (staff) {
				this.setData({
					showModal: true,
					editingStaff: staff,
					inputName: staff.name,
					inputStatus: staff.status,
				});
			}
		},

		// 切换员工状态
		onToggleStatus(e: WechatMiniprogram.TouchEvent) {
			const id = e.currentTarget.dataset.id as string;
			const staff = db.findById<StaffInfo>(Collections.STAFF, id);

			if (staff) {
				const newStatus: StaffStatus = staff.status === 'active' ? 'disabled' : 'active';
				db.updateById<StaffInfo>(Collections.STAFF, id, {status: newStatus});
				this.loadStaffList();

				wx.showToast({
					title: newStatus === 'active' ? '已启用' : '已禁用',
					icon: 'success',
				});
			}
		},

		// 删除员工
		onDeleteStaff(e: WechatMiniprogram.TouchEvent) {
			const id = e.currentTarget.dataset.id as string;
			const staff = db.findById<StaffInfo>(Collections.STAFF, id);

			if (!staff) return;

			wx.showModal({
				title: '确认删除',
				content: `确定要删除员工"${ staff.name }"吗？`,
				confirmColor: '#ff4d4f',
				success: (res) => {
					if (res.confirm) {
						db.deleteById<StaffInfo>(Collections.STAFF, id);
						this.loadStaffList();
						wx.showToast({title: '已删除', icon: 'success'});
					}
				},
			});
		},

		// 姓名输入
		onNameInput(e: WechatMiniprogram.Input) {
			this.setData({inputName: e.detail.value});
		},

		// 状态选择
		onStatusSelect(e: WechatMiniprogram.TouchEvent) {
			const status = e.currentTarget.dataset.status as StaffStatus;
			this.setData({inputStatus: status});
		},

		// 关闭弹窗
		onCloseModal() {
			this.setData({
				showModal: false,
				editingStaff: null,
				inputName: '',
				inputStatus: 'active',
			});
		},

		// 确认弹窗
		onConfirmModal() {
			const {inputName, inputStatus, editingStaff} = this.data;
			const name = inputName.trim();

			if (!name) {
				wx.showToast({title: '请输入员工姓名', icon: 'none'});
				return;
			}

			if (editingStaff) {
				// 编辑模式
				db.updateById<StaffInfo>(Collections.STAFF, editingStaff.id, {
					name,
					status: inputStatus,
				});
				wx.showToast({title: '修改成功', icon: 'success'});
			} else {
				// 添加模式 - 检查重名
				const exists = db.exists<StaffInfo>(Collections.STAFF, {name});
				if (exists) {
					wx.showToast({title: '员工姓名已存在', icon: 'none'});
					return;
				}

				const now = getTimestamp();
				const newStaff: StaffInfo = {
					id: generateId(),
					name,
					status: 'active',
					createdAt: now,
					updatedAt: now,
				};

				// 直接保存到存储
				const staffList = db.getAll<StaffInfo>(Collections.STAFF);
				staffList.push(newStaff);
				wx.setStorageSync('db_staff', staffList);

				wx.showToast({title: '添加成功', icon: 'success'});
			}

			this.onCloseModal();
			this.loadStaffList();
		},
	},
});
