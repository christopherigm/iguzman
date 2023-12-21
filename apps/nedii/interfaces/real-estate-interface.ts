// import type {BasePictureAttributesInterface} from 'utils';
// import type {StandInterface} from 'interfaces/stand-interface';

// interface RealEstateClassificationAttributesInterface extends BasePictureAttributesInterface {
//   name: string;
//   slug: string;
// };
// export interface RealEstateClassificationInterface {
//   id: number;
//   type: 'RealEstateClassification';
//   attributes: RealEstateClassificationAttributesInterface;
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//   }
// };

// export interface RealEstateFeatureInterface {
//   id: number;
//   type: 'RealEstateFeature';
//   attributes: {
//     name: string;
//   };
// };

// export interface RealEstatePictureInterface extends BasePictureAttributesInterface {
//   id: number;
//   type: 'RealEstatePicture';
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//     real_estate: {
//       data: RealEstateInterface;
//     };
//   };
// };

// interface RealEstateAttributesInterface extends BasePictureAttributesInterface {
//   name: string;
//   slug: string;
//   state: 'new' | 'like-new' | 'used';
//   year: number;
//   area: number;
//   num_of_bedrooms: number;
//   num_of_bathrooms: number;
//   num_of_parking_spots: number;
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
// };
// export interface RealEstateInterface {
//   id: number;
//   type: 'RealEstate';
//   attributes: RealEstateAttributesInterface;
//   relationships: {
//     stand: {
//       data: StandInterface;
//     };
//     classification: {
//       data: RealEstateClassificationInterface;
//     };
//     features: {
//       data: Array<RealEstateFeatureInterface>;
//     };
//     real_estate_pictures: {
//       data: Array<RealEstatePictureInterface>;
//     };
//     related: {
//       data: Array<RealEstateInterface>;
//     };
//   };
// };
