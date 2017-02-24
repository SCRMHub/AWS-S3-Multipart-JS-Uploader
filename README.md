# AWS-S3-Multipart-JS-Uploader
This library allows you to upload larges files directly to AWS in chunks directly from the browser, using the server to generate the URLs securely for each chunk. The backend is written in PHP but uses AWS' SDKs so is easy to port to other languages.

It was based off the work done by @ienzam here: 
https://github.com/ienzam/s3-multipart-upload-browser

And the javascript upload methods was inspired by the @flowjs library:
https://github.com/flowjs/flow.js

Ultimately, we combined those two approaches and added some bells and whistles to make it do what we needed it to. The only part missing is pausing because we didn't need it at the time.


## Getting Started ###

### Step 1: Download the files ###
Download the AWS Multpart Uploader here:
https://github.com/SCRMHub/AWS-S3-Multipart-JS-Uploader/master.zip

The project is structured everything in the root for demostration but you can structure it however you like.

### Step 2: Run Composer ###
Once you've extracted the files, run [composer](https://getcomposer.org/doc/00-intro.md#installation-linux-unix-osx). This will install the AWS SDK we use and configure the autoloader for our SDK files.
```shell
composer install
```

### Step 3: Enter your AWS Details and folder ###
Next, edit the file **config.php**. You will need to retrieve your details from your AWS Console. You can tweak the folder as well if you like.

```php
<?php
//Your AWS key
define('AWS_KEY',           'YOUR_KEY');

//Your AWS Secret
define('AWS_SECRET',        'YOUR SECRET');

//The name of the bucket to upload to
define('AWS_BUCKET_NAME',   'YOUR BUCKET NAME');

//This is the root of the bucket
define('AWS_BUCKET_FOLDER', '/');
```

### Step 4: Try it ###
With your server running, go to http://localhost:8000/index.htm.
This demonstration shows you:
- Initiating an upload
- Cancelling an upload
- Seeing the progress of the upload and parts of it
- Getting a result

```shell
php -S localhost:8000
```

## The Javascript ##
The library itself requires jQuery, purely because of their awesome ajax functions. It is fault tolerant, to the point that if a part fails to upload it will try that part two more times just in case it was a network glitch.

### Options ##
There are a few options you can adjust when invoking the JavaScript class:
```php
var uploader = new S3BlobUploader({
  type : 'video',
  partSize : (5 * 1024 * 1024),
  simultaneous : 4
});
```

- **debug**         : Show debug information from within the class
- **partSize**      : default is 5mb. You can adjust it, but we found this a good size and one mentioned in the AWS documents as a guide
- **simultaneous**  : how many chunks to upload at a time. Default is 4
- **server_url**    : define the endpoint where the upload urls are created. Defaults is './server.php',
- **type**          : we use this for the final upload and is passed to the server in the final request. This is useful if you need to do any additional processing or flag how you record the file
- **method**        : What method to call the server with. We have defaulted it to 'get'

### Cancelling / Aborting upload ###
The upload can be cancelled at any time by calling the **uploader.abort()** function. This will stop all chunks that are in progress and trigger the **cancel** event.


## Events ##
The are lots of events trigger during the upload to help you build interfaces, track errors, etc.

Events are configured on the **uploader** using the **on** function
```javascript
uploader.on(eventName, callback);

uploader.on('progress', function(data) {
    updateProgress(data);
});
```

### Available events ###
- **beforeUpload** : Called before any server calls are made.
Useful for resetting previous upload information

- **startUpload** : Once the first server call is complete, this event is fired.
Useful for any interface changes such as showing progress bars, etc.

- **progress** : This is called periodically as the javascript reports progress, and gives you the precentage uploaded so far.
  - @number percentage uploaded

- **progressStats** : Similar to progress but gives you lots of stats.
  - @int **total**          The total file size to upload
  - @int **uploaded**       The total amount uploaded
  - @int **percent**        The percentage of the total uploaded
  - @int **sureUploaded**   The total size of all completed chunks (e.g. not including the partial upload)
  - @int **surePercent**    The percentage of total completed chunks
  - @int **parts**          How many parts there are to upload
  - @int **partsCompleted** How many parts have been uploaded

- **finishing** : The final part of uploading requires AWS to "Stitch" the pieces together. This event is fired before that final call is made. If you want stats at this point, use the last **progressStats**

- **complete** : And voila! AWS Has completed putting the pieces back together.
  - @string The final file url on AWS S3.

- **error** : This is triggered on the event of something failing during upload. This can be useful for debugging to work out if it's a network connection or file corruption issue.
  - ok = false : It was not ok
  - result
    - partNum : Which part number failed
  - error : The raw javascript event that was reported

- **cancel** : Fired on the event of the user cancelling the upload. On the server, this will perform the AWS cleanup functions correctly to help you avoid server spam. The response contains no data as it was user triggered.


---
## We're hiring ##
We are an Artificial intelligence Marketing Technology startup that is growing quickly and working globally to deliver the next generation of tools and services. Our platform is pushing into new bigger markets and we’re looking for Engineers who are after their next challenge building a multi-lingual, multi-regional real-time platform built on big data and machine learning.

To find out more about your next company and see the current opportunities, visit our careers page
https://u.scrmhub.com/joinus

SCRM Hub, Bringing Artificial Intelligence to Marketing
