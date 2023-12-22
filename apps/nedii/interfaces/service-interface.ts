// import type { BasePictureAttributesInterface } from 'utils';
// import type { StandInterface } from 'interfaces/stand-interface';

// interface ServiceClassificationAttributesInterface
//   extends BasePictureAttributesInterface {
//   name: string;
//   slug: string;
// }
// export interface ServiceClassificationInterface {
//   id: number;
//   type: 'ServiceClassification';
//   attributes: ServiceClassificationAttributesInterface;
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//   };
// }

// export interface ServiceFeatureInterface {
//   id: number;
//   type: 'ServiceFeature';
//   attributes: {
//     name: string;
//   };
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//   };
// }
// //
// export interface ServicePictureInterface
//   extends BasePictureAttributesInterface {
//   id: number;
//   type: 'ServicePicture';
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//     service: {
//       data: ServiceInterface;
//     };
//   };
// }

// interface ServiceAttributesInterface extends BasePictureAttributesInterface {
//   name: string;
//   slug: string;
//   publish_on_the_wall: boolean;
//   price: number;
//   discount: number;
//   final_price: number;
//   short_description: string;
//   video_link: string;
//   support_email: string;
//   support_info: string;
//   support_phone: string;
//   warranty_days: number;
//   times_selled: number;
//   views: number;
// }
// export interface ServiceInterface {
//   id: number;
//   type: 'Service';
//   attributes: ServiceAttributesInterface;
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//     classification: {
//       data: ServiceClassificationInterface;
//     };
//     features: {
//       data: Array<ServiceFeatureInterface>;
//     };
//     service_pictures: {
//       data: Array<ServicePictureInterface>;
//     };
//     related: {
//       data: Array<ServiceInterface>;
//     };
//   };
// }
