import { getCurrentDate, getNextDate, getPreviousDate } from '../../utils/util';

interface DatePickerData {
	selectedDate: string
	isToday: boolean
	displayDate: string
}

Component({
	properties: {
		initialDate: {
			type: String,
			value: ''
		}
	},

	data: {
		selectedDate: '',
		isToday: false,
		displayDate: ''
	} as DatePickerData,

	lifetimes: {
		attached() {
			const today = getCurrentDate();
			this.setData({
				selectedDate: this.properties.initialDate || today,
				isToday: (this.properties.initialDate || today) === today,
				displayDate: this.formatDisplayDate(this.properties.initialDate || today)
			});
		}
	},

	observers: {
		'initialDate': function(newDate: string) {
			if (newDate) {
				const today = getCurrentDate();
				this.setData({
					selectedDate: newDate,
					isToday: newDate === today,
					displayDate: this.formatDisplayDate(newDate)
				});
			}
		}
	},

	methods: {
		formatDisplayDate(dateStr: string): string {
			if (!dateStr) return '';
			const date = new Date(dateStr);
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${month}-${day}`;
		},

		onPreviousDay() {
			const previousDate = getPreviousDate(this.data.selectedDate);
			if (previousDate) {
				this.setData({
					selectedDate: previousDate,
					isToday: previousDate === getCurrentDate(),
					displayDate: this.formatDisplayDate(previousDate)
				});
				this.triggerEvent('change', { date: previousDate });
			}
		},

		onToday() {
			const today = getCurrentDate();
			this.setData({
				selectedDate: today,
				isToday: true,
				displayDate: this.formatDisplayDate(today)
			});
			this.triggerEvent('change', { date: today });
		},

		onNextDay() {
			const nextDate = getNextDate(this.data.selectedDate);
			if (nextDate) {
				this.setData({
					selectedDate: nextDate,
					isToday: nextDate === getCurrentDate(),
					displayDate: this.formatDisplayDate(nextDate)
				});
				this.triggerEvent('change', { date: nextDate });
			}
		},

		onDateSelect(e: WechatMiniprogram.CustomEvent) {
			const date = e.detail.value;
			this.setData({
				selectedDate: date,
				isToday: date === getCurrentDate(),
				displayDate: this.formatDisplayDate(date)
			});
			this.triggerEvent('change', { date });
		}
	}
});
