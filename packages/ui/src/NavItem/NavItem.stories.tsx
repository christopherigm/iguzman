import React from 'react';
import { ComponentStory, ComponentMeta } from '@storybook/react';
import NavItem from './NavItem';

export default {
  title: 'Components/NavItem',
  component: NavItem,
  argTypes: {
    href: { control: 'text' },
    callback: { action: 'clicked' },
    icon: { control: 'object' },
    selected: { control: 'boolean' },
    subMenus: { control: 'object' },
  },
} as ComponentMeta<typeof NavItem>;

const Template: ComponentStory<typeof NavItem> = (args) => (
  <NavItem {...args} />
);

export const Default = Template.bind({});
Default.args = {
  children: 'Navigation Item',
};

export const WithIcon = Template.bind({});
WithIcon.args = {
  children: 'Navigation Item',
  icon: <span>Icon</span>,
};

export const WithLink = Template.bind({});
WithLink.args = {
  children: 'Navigation Item',
  href: '/dashboard',
};

export const WithCallback = Template.bind({});
WithCallback.args = {
  children: 'Navigation Item',
  callback: () => console.log('Clicked'),
};

export const WithSubMenus = Template.bind({});
WithSubMenus.args = {
  children: 'Navigation Item',
  subMenus: [{ children: 'Sub Item 1' }, { children: 'Sub Item 2' }],
};
