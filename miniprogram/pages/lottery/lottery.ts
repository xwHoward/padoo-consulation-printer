import { cloudDb, Collections } from '../../utils/cloud-db';

Page({
	data: {
		prizes: [] as LotteryPrize[],
		wheelRotation: 0,
		isSpinning: false,
		winningPrize: null as LotteryPrize | null,
		showResultModal: false
	},

	onLoad() {
		this.loadPrizes();
	},

	async loadPrizes() {
		try {
			const prizes = await cloudDb.getAll<LotteryPrize>(Collections.LOTTERY_PRIZES);
			const activePrizes = prizes.filter(p => p.status === 'normal');
			this.setData({ prizes: activePrizes });

			if (activePrizes.length === 0) {
				wx.showModal({
					title: '提示',
					content: '暂无可用奖品，请先在数据管理中配置奖品',
					showCancel: false,
					success: () => {
						wx.navigateBack();
					}
				});
			}
		} catch (error) {
			wx.showToast({ title: '加载奖品失败', icon: 'none' });
		}
	},

	async startLottery() {
		const { prizes, isSpinning } = this.data;

		if (isSpinning) return;

		if (prizes.length === 0) {
			wx.showToast({ title: '暂无可用奖品', icon: 'none' });
			return;
		}

		this.setData({ isSpinning: true });

		const prize = await this.drawPrize();
		if (!prize) {
			this.setData({ isSpinning: false });
			wx.showToast({ title: '抽奖失败', icon: 'none' });
			return;
		}

		const prizeIndex = prizes.findIndex(p => p._id === prize._id);
		const segmentAngle = 360 / prizes.length;
		const targetAngle = 360 * 5 + (360 - prizeIndex * segmentAngle) - segmentAngle / 2;

		this.setData({
			wheelRotation: targetAngle,
			winningPrize: prize
		});

		setTimeout(() => {
			this.setData({ 
				isSpinning: false,
				showResultModal: true 
			});
		}, 4000);
	},

	async drawPrize(): Promise<LotteryPrize | null> {
		const { prizes } = this.data;
		const totalProbability = prizes.reduce((sum, p) => sum + p.probability, 0);

		if (totalProbability === 0) {
			return prizes[Math.floor(Math.random() * prizes.length)];
		}

		let random = Math.random() * totalProbability;
		for (const prize of prizes) {
			if (random < prize.probability) {
				return prize;
			}
			random -= prize.probability;
		}

		return prizes[prizes.length - 1];
	},

	onResultModalClose() {
		this.setData({
			showResultModal: false,
			winningPrize: null
		});
	}
});
