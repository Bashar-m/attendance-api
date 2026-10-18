import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** معرّف ثابت: في المجموعة مستند واحد فقط هو إعدادات النظام. */
export const SETTINGS_ID = 'app';

@Schema({ timestamps: true })
export class Settings {
  // معرّف نصي ثابت بدل ObjectId: "اقرأ أو أنشئ" يستهدف المستند نفسه دائمًا،
  // فلا يُنشأ مستندان لو وصل طلبان معًا قبل وجوده.
  @Prop({ type: String })
  _id: string;

  // أيام العطلة الأسبوعية بترقيم JavaScript: 0 = الأحد ... 5 = الجمعة، 6 = السبت.
  // سجلات هذه الأيام لا تدخل مجموع الساعات ولا ملف Excel.
  @Prop({ type: [Number], default: [5, 6] })
  weekendDays: number[];
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
