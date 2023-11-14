import { Signal, signal } from "@preact/signals-react";
import NediiPlan from 'classes/nedii-plans';

export default class StandRelationships {
  public plan = {
    data: new NediiPlan()
  };
}



// owner: {
//   data: UserInterface;
// };
// expo: {
//   data: ExpoInterface;
// };
// group: {
//   data: GroupInterface;
// };
// panorama: {
//   data: Array<StandPictureInterface>;
// };
// video_links: {
//   data: Array<VideoLinkInterface>;
// };
// pictures: {
//   data: Array<StandPictureInterface>;
// };
// phones: {
//   data: Array<StandPhoneInterface>;
// };
// city: {
//   data: CityInterface;
// };
// stand_booking_questions: {
//   data: Array<StandBookingQuestionInterface>;
// };
// stand_news: {
//   data: Array<StandNewInterface>;
// };
// promotions: {
//   data: Array<StandPromotionInterface>;
// };
// survey_questions: {
//   data: Array<SurveyQuestionInterface>;
// };
// ratings: {
//   data: Array<StandRatingInterface>;
// };
// highlighted_products: {
//   data: Array<ProductInterface>;
// };
// highlighted_services: {
//   data: Array<ServiceInterface>;
// };
// highlighted_meals: {
//   data: Array<MealInterface>;
// };
// highlighted_real_estates: {
//   data: Array<RealEstateInterface>;
// };
// highlighted_vehicles: {
//   data: Array<VehicleInterface>;
// };