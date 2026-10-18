import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { SettingsUpdateDto } from './dto/settings.update.dto.js';
import { SETTINGS_ID, Settings } from './schema/settings.schema.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<Settings>,
  ) {}

  /** الإعدادات الحالية. أول قراءة تنشئ المستند بالقيم الافتراضية. */
  async get(): Promise<{ weekendDays: number[] }> {
    return this.upsert({});
  }

  async update(dto: SettingsUpdateDto): Promise<{ weekendDays: number[] }> {
    const weekendDays = [...dto.weekendDays].sort((a, b) => a - b);
    return this.upsert({ $set: { weekendDays } });
  }

  // عملية ذرّية واحدة: عدّل المستند إن وُجد، وإلا أنشئه بالقيم الافتراضية ثم عدّله.
  private async upsert(update: UpdateQuery<Settings>) {
    const settings = await this.settingsModel
      .findOneAndUpdate({ _id: SETTINGS_ID }, update, {
        upsert: true,
        setDefaultsOnInsert: true,
        returnDocument: 'after',
      })
      .orFail()
      .exec();
    return { weekendDays: settings.weekendDays };
  }
}
