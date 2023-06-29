from django.contrib import admin
from stand.models import (
    Expo,
    Group,
    StandPhone,
    StandRating,
    StandPicture,
    SurveyQuestion,
    VideoLink,
    StandBookingQuestion,
    StandBookingQuestionOption,
    StandNew,
    StandPicture,
    StandPromotion,
    Stand
)


class ExpoAdmin(admin.ModelAdmin):
	list_display = [
		"name",
		"slug",
		"enabled",
		"version"
	]
	search_fields = ("slug", "name")
	list_filter = ("enabled",)
	readonly_fields=(
        "version",
        "href"
	)
admin.site.register(Expo, ExpoAdmin)


class GroupAdmin(admin.ModelAdmin):
	list_display = [
		"name",
		"slug",
		"enabled",
	]
	search_fields = ("slug", "name", "description" )
	list_filter = ("enabled",)
	readonly_fields=(
        "version",
        "href"
	)
admin.site.register(Group, GroupAdmin)


class StandPhoneAdmin(admin.ModelAdmin):
	list_display = [
		"phone",
		"stand"
	]
	search_fields = ("phone", )
	list_filter = ("enabled", "stand", )
	readonly_fields=(
        "version",
	)
admin.site.register(StandPhone, StandPhoneAdmin)


class StandPictureAdmin(admin.ModelAdmin):
	list_display = [
		"name",
		"stand",
	]
	search_fields = ("name", "description")
	list_filter = ("enabled", "stand", )
	readonly_fields=(
        "version",
	)
admin.site.register(StandPicture, StandPictureAdmin)


class StandBookingQuestionAdmin(admin.ModelAdmin):
	list_display = [
		"name",
		"open_answer",
	]
	search_fields = ("name", )
	list_filter = ("enabled", )
	readonly_fields=(
        "version",
        "order"
	)
admin.site.register(StandBookingQuestion, StandBookingQuestionAdmin)


class StandBookingQuestionOptionAdmin(admin.ModelAdmin):
	list_display = [
		"value",
	]
	search_fields = ("value",)
	list_filter = ("enabled",)
	readonly_fields=(
        "version",
        "order"
	)
admin.site.register(StandBookingQuestionOption, StandBookingQuestionOptionAdmin)


class StandNewAdmin(admin.ModelAdmin):
	list_display = [
		"slug",
		"name",
		"stand",
	]
	search_fields = ("slug", "name", "description")
	list_filter = ("enabled", "stand", )
	readonly_fields=(
        "version",
	)
admin.site.register(StandNew, StandNewAdmin)


class StandPromotionAdmin(admin.ModelAdmin):
	list_display = [
		"slug",
		"name",
		# "product",
		# "real_estate",
		# "vehicle",
		# "service",
		"stand",
	]
	search_fields = ("slug", "name",)
	list_filter = ("enabled", "stand")
	readonly_fields=(
        "version",
	)
admin.site.register(StandPromotion, StandPromotionAdmin)


class VideoLinkAdmin(admin.ModelAdmin):
	list_display = [
		"link",
		"name",
		"stand",
	]
	search_fields = ("name",)
	list_filter = ("enabled", "stand", )
	readonly_fields=(
        "version",
	)
admin.site.register(VideoLink, VideoLinkAdmin)


class SurveyQuestionAdmin(admin.ModelAdmin):
	list_display = [
		"name",
	]
	search_fields = ("name",)
	list_filter = ("enabled", )
	readonly_fields=(
        "version",
	)
admin.site.register(SurveyQuestion, SurveyQuestionAdmin)


class StandRatingAdmin(admin.ModelAdmin):
	list_display = [
		"author",
		"stand",
		"rating"
	]
	list_filter = ("stand","author")
	readonly_fields=(
        "version",
	)
admin.site.register(StandRating, StandRatingAdmin)


class StandAdmin(admin.ModelAdmin):
	list_display = [
		"slug",
		"name",
        "group",
        "expo",
	    "plan",
	]
	search_fields = ("name", )
	list_filter = ("slug", "enabled", "owner", "group", "expo", "plan",)
	readonly_fields=(
		"version",
	)
admin.site.register(Stand, StandAdmin)

