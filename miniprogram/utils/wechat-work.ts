export function formatMention(staff: Pick<StaffInfo, 'name'|'phone'|'wechatWorkId'> | null | undefined): string {
	if (!staff) {
		return '';
	}

	if (staff.wechatWorkId && staff.wechatWorkId.trim()) {
		return `<@${staff.wechatWorkId.trim()}>`;
	}

	if (staff.phone && staff.phone.trim()) {
		return `${staff.name}<@${staff.phone.trim()}>`;
	}

	return staff.name;
}
