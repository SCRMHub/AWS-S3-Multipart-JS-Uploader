# AWS-S3-Multipart-JS-Uploader
This library allows you to upload larges files directly to AWS in chunks directly from the browser, using the server to generate the URLs securely for each chunk. The backend is written in PHP but uses AWS' SDKs so is easy to port to other languages.

It was based of the work done by ienzam here: 
https://github.com/ienzam/s3-multipart-upload-browser

And the javascript upload methods was inspired by the flowjs library:
https://github.com/flowjs/flow.js

Ultimately, we combined those two approaches and added some bells and whistles to make it do what we needed it to. The only part missing is pausing because we didn't need it at the time.
