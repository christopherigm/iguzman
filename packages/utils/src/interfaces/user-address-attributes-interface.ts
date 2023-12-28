export interface UserAddressAttributesInterface {
  alias: string;
  receptor_name: string;
  phone: string;
  zip_code: string;
  street: string;
  ext_number: string;
  int_number: string;
  reference: string;
  address_type: 'house' | 'apartment' | 'work' | 'mail_box';
  delivery_instructions: string;
}
