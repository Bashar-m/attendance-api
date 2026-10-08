import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * كل المسارات في هذا المشروع محمية افتراضيًا (انظر JwtAuthGuard).
 * نضع @Public() فوق المسار الذي نريد فتحه بلا توكن، مثل تسجيل الدخول.
 *
 * SetMetadata لا "يفعل" شيئًا وحده: هو فقط يلصق ملصقًا على المسار،
 * والحارس هو الذي يقرأ الملصق لاحقًا عبر Reflector ويقرّر.
 *
 * لماذا "مغلق افتراضيًا"؟ لأن نسيان @Public() يعطيك خطأ 401 تلاحظه فورًا،
 * أما نسيان الحارس في نظام "مفتوح افتراضيًا" فيعطيك ثغرة لا يلاحظها أحد.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
