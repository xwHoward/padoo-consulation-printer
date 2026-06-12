<template>
  <div class="cp-room-grid">
    <div class="cp-rg-empty" v-if="!rooms || rooms.length === 0">
      暂无房间数据
    </div>
    <div class="cp-rg-grid" v-else>
      <div
        v-for="room in rooms"
        :key="room.name"
        class="cp-rg-item"
        :class="{ 'cp-rg-item--occupied': room.isOccupied }"
      >
        <div class="cp-rg-name">{{ room.name }}</div>
        <div class="cp-rg-details" v-if="room.isOccupied && room.occupiedRecords">
          <div
            v-for="(record, idx) in room.occupiedRecords"
            :key="idx"
            class="cp-rg-record"
          >
            <span class="cp-rg-tag cp-rg-tag--customer">{{ record.customerName }}</span>
            <span class="cp-rg-tag cp-rg-tag--staff">{{ record.technician }}</span>
            <span class="cp-rg-tag cp-rg-tag--time">{{ record.endTime }}下</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  rooms: { type: Array, default: () => [] }
})
</script>

<style lang="less" scoped>
.cp-room-grid {
  .cp-rg-empty {
    text-align: center;
    padding: 12px;
    color: #999;
    font-size: 13px;
  }

  .cp-rg-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cp-rg-item {
    flex: 1 1 28%;
    min-width: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 6px;
    border-radius: 8px;
    border: 1px solid #ebeef5;
    background: #fafafa;
    transition: all 0.2s;

    &--occupied {
      background: rgba(255, 107, 0, 0.05);
      border-color: rgba(255, 107, 0, 0.2);
    }

    .cp-rg-name {
      font-size: 14px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }
  }

  .cp-rg-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    margin-top: 6px;
  }

  .cp-rg-record {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    flex-wrap: wrap;

    &:not(:last-child) {
      border-bottom: 1px dashed rgba(255, 107, 0, 0.15);
      padding-bottom: 5px;
    }
  }

  .cp-rg-tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;

    &--customer {
      background: rgba(255, 107, 0, 0.08);
      color: #333;
      font-weight: 600;
    }
    &--staff {
      background: rgba(255, 107, 0, 0.1);
      color: #e65100;
    }
    &--time {
      background: rgba(255, 107, 0, 0.1);
      color: #888;
    }
  }
}
</style>
