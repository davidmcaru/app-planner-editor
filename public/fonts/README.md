# Typefaces

The fonts the planner offers, plus Inter for the interface. All of them are under the SIL Open Font License 1.1:
the licence of each family is in `licenses/`, and their authors are listed in `CREDITS.md`, at the root of the
repository.

The files were compressed to WOFF2 and are otherwise unchanged. Dancing Script, Inter and Playfair Display are
variable fonts: one file carries every weight.

To add a typeface, put its file here, declare it in `css/planner-fonts.css` and add it to
`components/features/fonts/font-registry.ts`. Keep its licence with it.
