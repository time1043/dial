```shell
mkdir -p dial
cp main.js manifest.json styles.css dial/
zip -r dial.zip dial/
```

```shell
gh release create v0.0.1 dial.zip --title "Dial v0.0.1" --notes "Initial release"
```
