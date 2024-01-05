import type {
  BaseUser,
  BaseUserAttributes
} from 'utils';

interface attributes extends BaseUserAttributes {
  img_hero_picture: string;
  birthday: string;
  open_to_work: boolean;
  listening_offers: boolean;
  headline: string;
  biography: string;
  legal_name: string;
  linkedin: string;
  github: string;
}

export default interface UserInterface extends BaseUser{
  attributes: attributes
};
